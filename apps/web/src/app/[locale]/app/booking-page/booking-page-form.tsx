"use client";

import { CopyIcon, ExternalLinkIcon, ImageUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions";
import { removeCoverAction, saveBookingPageAction, uploadCoverAction } from "./actions";

interface Values {
  enabled: boolean;
  intro: string;
  showReviews: boolean;
  coverUrl: string | null;
  faq: { question: string; answer: string }[];
}

export function BookingPageForm({ pageUrl, embedCode, values }: { pageUrl: string; embedCode: string; values: Values }) {
  const t = useTranslations("bookingPageSettings");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(values.enabled);
  const [intro, setIntro] = useState(values.intro);
  const [showReviews, setShowReviews] = useState(values.showReviews);
  const [faq, setFaq] = useState(values.faq.length ? values.faq : [{ question: "", answer: "" }]);
  const coverInput = useRef<HTMLInputElement>(null);

  const run = (task: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const r = await task();
      if (!r.ok) return void (r.message && toast.error(r.message));
      if (r.message) toast.success(r.message);
      router.refresh();
    });

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(t("copied"));
  };

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("yourPage")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md bg-muted px-2 py-1 text-sm break-all">{pageUrl}</code>
            <Button variant="outline" size="sm" asChild>
              <a href={pageUrl} target="_blank" rel="noopener">
                <ExternalLinkIcon />
                {t("open")}
              </a>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => copy(pageUrl)}>
              <CopyIcon />
              {t("copyLink")}
            </Button>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="grid gap-0.5">
              <label htmlFor="bp-enabled" className="text-sm font-medium">
                {t("enabled")}
              </label>
              <p className="text-xs text-muted-foreground">{t("enabledHint")}</p>
            </div>
            <Switch id="bp-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("cover")}</CardTitle>
          <CardDescription>{t("coverHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {values.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- served from /files
            <img src={values.coverUrl} alt="" className="aspect-[3/1] w-full rounded-xl object-cover" />
          )}
          <form action={(form) => run(() => uploadCoverAction(form))} className="flex flex-wrap gap-2">
            <input
              ref={coverInput}
              name="cover"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              aria-label={t("uploadCover")}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            />
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => coverInput.current?.click()}>
              <ImageUpIcon />
              {t("uploadCover")}
            </Button>
            {values.coverUrl && (
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(removeCoverAction)}>
                {t("removeCover")}
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("content")}</CardTitle>
          <CardDescription>{t("artistsHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <FormField id="bp-intro" label={t("intro")} hint={t("introHint")}>
            <Textarea id="bp-intro" value={intro} onChange={(e) => setIntro(e.target.value)} rows={5} maxLength={5000} />
          </FormField>
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="bp-reviews" className="text-sm font-medium">
              {t("showReviews")}
            </label>
            <Switch id="bp-reviews" checked={showReviews} onCheckedChange={setShowReviews} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("faq")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {faq.map((item, i) => (
            <div key={i} className="grid gap-2 rounded-xl border p-3">
              <div className="flex items-end gap-2">
                <FormField id={`bp-q-${i}`} label={t("question")} className="flex-1">
                  <Input
                    id={`bp-q-${i}`}
                    value={item.question}
                    maxLength={300}
                    onChange={(e) => setFaq((f) => f.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))}
                  />
                </FormField>
                <Button variant="ghost" size="icon-sm" aria-label={t("removeFaq")} onClick={() => setFaq((f) => f.filter((_, j) => j !== i))}>
                  <Trash2Icon />
                </Button>
              </div>
              <FormField id={`bp-a-${i}`} label={t("answer")}>
                <Textarea
                  id={`bp-a-${i}`}
                  value={item.answer}
                  rows={2}
                  maxLength={3000}
                  onChange={(e) => setFaq((f) => f.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))}
                />
              </FormField>
            </div>
          ))}
          <Button variant="outline" size="sm" className="w-fit" onClick={() => setFaq((f) => [...f, { question: "", answer: "" }])}>
            <PlusIcon />
            {t("addFaq")}
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button disabled={pending} onClick={() => run(() => saveBookingPageAction({ enabled, intro, showReviews, faq }))}>
          {t("save")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("embed")}</CardTitle>
          <CardDescription>{t("embedHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
            <code>{embedCode}</code>
          </pre>
          <Button variant="outline" size="sm" className="w-fit" onClick={() => copy(embedCode)}>
            <CopyIcon />
            {t("copyCode")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
