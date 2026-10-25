"use client";

import { ArrowDownIcon, ArrowLeftIcon, ArrowUpIcon, CalendarClockIcon, EyeIcon, PlusIcon, SendIcon, TestTubeIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormatter } from "@/components/date-prefs";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { matchesSearch } from "@stagedesk/core";
import { FormField } from "@/components/form-field";
import { Pill, type Tone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link, useRouter } from "@/i18n/navigation";
import { cancelAction, type CampaignForm, previewCampaignAction, saveCampaignAction, scheduleAction, sendNowAction, sendTestAction } from "../actions";
import { NativeSelect } from "@/components/ui/native-select";

interface Campaign extends CampaignForm {
  id: string;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  recipients: number;
  sentCount: number;
  failedCount: number;
}

const tone: Record<string, Tone> = { draft: "neutral", scheduled: "info", sending: "warning", sent: "success", cancelled: "danger" };
const selectClass = "h-9 rounded-md border bg-background px-2.5 text-sm";

/** Local date-time for <input type="datetime-local">, a minute ahead by default. */
function localInput(iso: string | null) {
  const d = iso ? new Date(iso) : new Date(Date.now() + 60 * 60_000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function CampaignEditor({
  campaign,
  articles,
  audienceSizes,
  testEmail,
}: {
  campaign: Campaign | null;
  articles: { id: string; title: string; date: string }[];
  audienceSizes: Record<"all" | "nl" | "en", number>;
  testEmail: string;
}) {
  const t = useTranslations("newsletter");
  const tl = useTranslations("languages");
  const format = useFormatter();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState<CampaignForm>(
    campaign ?? { subjectNl: "", subjectEn: "", bodyNl: "", bodyEn: "", articleIds: [], audience: "all" },
  );
  const set = (patch: Partial<CampaignForm>) => setV((x) => ({ ...x, ...patch }));
  const [search, setSearch] = useState("");
  const [previewLocale, setPreviewLocale] = useState<"nl" | "en">("nl");
  const [preview, setPreview] = useState<string | null>(null);
  const [test, setTest] = useState(testEmail);
  const [when, setWhen] = useState(localInput(campaign?.scheduledAt ?? null));
  const editable = !campaign || campaign.status === "draft" || campaign.status === "scheduled";
  const dt = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

  // While sending, the progress refreshes itself.
  useEffect(() => {
    if (campaign?.status !== "sending") return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [campaign?.status, router]);

  // Live preview, a moment after the last change.
  useEffect(() => {
    const timer = setTimeout(() => {
      void previewCampaignAction(v, previewLocale).then(setPreview, () => setPreview(null));
    }, 500);
    return () => clearTimeout(timer);
  }, [v, previewLocale]);

  /** Saves first (a new campaign gets its id), then runs the next step. */
  const withSaved = (next?: (id: string) => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      let id = campaign?.id ?? null;
      if (editable) {
        const saved = await saveCampaignAction(id, v);
        if (!saved.ok) return void toast.error(saved.message);
        id = saved.id ?? id;
        if (!next) toast.success(saved.message);
      }
      if (next && id) {
        const r = await next(id);
        if (r.message) (r.ok ? toast.success : toast.error)(r.message);
        if (!r.ok) return;
      }
      if (id && !campaign) router.replace(`/app/newsletter/${id}`);
      else router.refresh();
    });

  const chosen = v.articleIds.map((id) => articles.find((a) => a.id === id)).filter((a): a is (typeof articles)[number] => Boolean(a));
  const available = articles.filter((a) => !v.articleIds.includes(a.id) && matchesSearch(a.title, search)).slice(0, 8);
  const move = (i: number, d: -1 | 1) => {
    const ids = [...v.articleIds];
    [ids[i], ids[i + d]] = [ids[i + d]!, ids[i]!];
    set({ articleIds: ids });
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <Link href="/app/newsletter" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-4" aria-hidden />
            {t("back")}
          </Link>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {v.subjectNl || t("newCampaign")}
            {campaign && <Pill tone={tone[campaign.status] ?? "neutral"}>{t(`status_${campaign.status as "draft"}`)}</Pill>}
          </h1>
          {campaign?.status === "scheduled" && campaign.scheduledAt && <p className="text-sm text-muted-foreground">{t("scheduledFor", { date: dt(campaign.scheduledAt) })}</p>}
          {campaign?.sentAt && <p className="text-sm text-muted-foreground">{t("sentOn", { date: dt(campaign.sentAt) })}</p>}
        </div>
        {editable && (
          <Button onClick={() => withSaved()} disabled={pending}>
            {t("save")}
          </Button>
        )}
      </div>

      {campaign && (campaign.status === "sending" || campaign.status === "sent") && (
        <Card>
          <CardContent className="grid gap-2">
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span className="font-medium">{t("progress", { sent: campaign.sentCount, total: campaign.recipients })}</span>
              {campaign.failedCount > 0 && <span className="text-destructive">{t("failed", { count: campaign.failedCount })}</span>}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-success transition-all" style={{ width: `${campaign.recipients ? Math.round(((campaign.sentCount + campaign.failedCount) / campaign.recipients) * 100) : 0}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">{t("readOnly")}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-6">
          <Card>
            <CardContent className="grid gap-4">
              <fieldset disabled={!editable} className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField id="nc-subject-nl" label={t("subjectNl")}>
                    <Input id="nc-subject-nl" required maxLength={191} value={v.subjectNl} onChange={(e) => set({ subjectNl: e.target.value })} />
                  </FormField>
                  <FormField id="nc-subject-en" label={t("subjectEn")}>
                    <Input id="nc-subject-en" required maxLength={191} value={v.subjectEn} onChange={(e) => set({ subjectEn: e.target.value })} />
                  </FormField>
                </div>
                <FormField id="nc-body-nl" label={t("bodyNl")} hint={t("bodyHint")}>
                  <Textarea id="nc-body-nl" rows={7} value={v.bodyNl} onChange={(e) => set({ bodyNl: e.target.value })} />
                </FormField>
                <FormField id="nc-body-en" label={t("bodyEn")}>
                  <Textarea id="nc-body-en" rows={7} value={v.bodyEn} onChange={(e) => set({ bodyEn: e.target.value })} />
                </FormField>
                <FormField id="nc-audience" label={t("audience")} required>
                  <NativeSelect id="nc-audience" className={selectClass} value={v.audience} onChange={(e) => set({ audience: e.target.value as "all" })}>
                    {(["all", "nl", "en"] as const).map((a) => (
                      <option key={a} value={a}>
                        {t(`audience_${a}`)} · {t("audienceCount", { count: audienceSizes[a] })}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
              </fieldset>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("articles")}</CardTitle>
              <CardDescription>{t("articlesHint")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {chosen.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noArticles")}</p>
              ) : (
                <ol className="grid gap-2">
                  {chosen.map((a, i) => (
                    <li key={a.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                      <span className="w-5 text-right text-muted-foreground tabular-nums">{i + 1}.</span>
                      <span className="min-w-0 flex-1 truncate">{a.title}</span>
                      {editable && (
                        <>
                          <Button variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("moveUp")}>
                            <ArrowUpIcon />
                          </Button>
                          <Button variant="ghost" size="icon-sm" disabled={i === chosen.length - 1} onClick={() => move(i, 1)} aria-label={t("moveDown")}>
                            <ArrowDownIcon />
                          </Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => set({ articleIds: v.articleIds.filter((x) => x !== a.id) })} aria-label={t("removeArticle")}>
                            <XIcon />
                          </Button>
                        </>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              {editable && v.articleIds.length < 12 && (
                <div className="grid gap-2">
                  <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("articleSearch")} aria-label={t("articleSearch")} />
                  <ul className="grid gap-1">
                    {available.map((a) => (
                      <li key={a.id} className="flex items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">{a.title}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{a.date}</span>
                        <Button variant="outline" size="xs" onClick={() => set({ articleIds: [...v.articleIds, a.id] })}>
                          <PlusIcon />
                          {t("addArticle")}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {editable && (
            <Card>
              <CardContent className="grid gap-5">
                <div className="grid gap-2">
                  <p className="flex items-center gap-2 font-medium">
                    <TestTubeIcon className="size-4 text-primary" aria-hidden />
                    {t("testTitle")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Input type="email" value={test} onChange={(e) => setTest(e.target.value)} aria-label={t("testEmail")} className="min-w-56 flex-1" />
                    <Button variant="outline" disabled={pending} onClick={() => withSaved((id) => sendTestAction(id, test, previewLocale))}>
                      {t("sendTest")}
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2">
                  <p className="flex items-center gap-2 font-medium">
                    <CalendarClockIcon className="size-4 text-primary" aria-hidden />
                    {t("schedule")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label={t("scheduleAt")} className="w-fit" />
                    <Button variant="outline" disabled={pending} onClick={() => withSaved((id) => scheduleAction(id, new Date(when).toISOString()))}>
                      {t("schedule")}
                    </Button>
                    {campaign?.status === "scheduled" && (
                      <Button variant="ghost" disabled={pending} onClick={() => withSaved((id) => scheduleAction(id, null))}>
                        {t("unschedule")}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button disabled={pending || audienceSizes[v.audience] === 0}>
                        <SendIcon />
                        {t("sendNow")}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{t("sendNow")}</DialogTitle>
                        <DialogDescription>{t("sendNowConfirm", { count: audienceSizes[v.audience] })}</DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button variant="outline">{t("cancel")}</Button>
                        </DialogClose>
                        <DialogClose asChild>
                          <Button onClick={() => withSaved((id) => sendNowAction(id))}>{t("sendNow")}</Button>
                        </DialogClose>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  {campaign && (
                    <Button variant="ghost" className="text-destructive" disabled={pending} onClick={() => withSaved((id) => cancelAction(id))}>
                      {t("cancel")}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="content-start xl:sticky xl:top-20">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <EyeIcon className="size-4 text-primary" aria-hidden />
              {t("preview")}
            </CardTitle>
            <NativeSelect aria-label={t("previewLocale")} className={selectClass} value={previewLocale} onChange={(e) => setPreviewLocale(e.target.value as "nl")}>
              <option value="nl">{tl("nl")}</option>
              <option value="en">{tl("en")}</option>
            </NativeSelect>
          </CardHeader>
          <CardContent>
            {preview ? (
              <iframe title={t("preview")} srcDoc={preview} sandbox="" className="h-[44rem] w-full rounded-lg border bg-white" />
            ) : (
              <div className="h-[44rem] animate-pulse rounded-lg bg-muted" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
