"use client";

import { ImageUpIcon, PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormatter } from "@/components/date-prefs";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Pill, type Tone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/date-picker";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions";
import { eventDate } from "@/lib/format";
import {
  respondShareAction,
  revokeShareAction,
  saveArtistAction,
  setUnavailableAction,
  shareArtistAction,
  uploadArtistPhotoAction,
} from "./actions";

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (task: () => Promise<ActionResult>, after?: (r: ActionResult) => void) =>
    startTransition(async () => {
      const result = await task();
      if (!result.ok) return void (result.message && toast.error(result.message));
      if (result.message) toast.success(result.message);
      after?.(result);
      router.refresh();
    });
  return [pending, run] as const;
}

interface ArtistValues {
  id: string;
  stageName: string;
  genres: string;
  bio: string;
  sharePct: string;
  userId: string | null;
  active: boolean;
  showOnBookingPage: boolean;
  mediaLinks: string;
}

const NO_ACCOUNT = "none";

export function ArtistDialog({ artist, accounts }: { artist?: ArtistValues; accounts: { id: string; label: string }[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState(artist?.userId ?? NO_ACCOUNT);
  const [active, setActive] = useState(artist?.active ?? true);
  const [onPage, setOnPage] = useState(artist?.showOnBookingPage ?? true);
  const [pending, run] = useRun();

  function save(form: FormData) {
    run(
      () =>
        saveArtistAction({
          id: artist?.id ?? null,
          stageName: String(form.get("stageName")),
          genres: String(form.get("genres") ?? ""),
          bio: String(form.get("bio") ?? "") || null,
          sharePct: Number(String(form.get("sharePct")).replace(",", ".")),
          userId: userId === NO_ACCOUNT ? null : userId,
          email: artist ? null : String(form.get("email") ?? ""),
          active,
          showOnBookingPage: onPage,
          mediaLinks: String(form.get("mediaLinks") ?? ""),
        }),
      (result) => {
        setOpen(false);
        if (!artist && "id" in result && result.id) router.push(`/app/artists/${result.id}`);
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {artist ? (
          <Button variant="outline">
            <PencilIcon />
            {t("booking.edit")}
          </Button>
        ) : (
          <Button>
            <PlusIcon />
            {t("artists.add")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{artist ? artist.stageName : t("artists.addTitle")}</DialogTitle>
        </DialogHeader>
        <form action={save} className="grid gap-4 sm:grid-cols-2">
          <FormField id="ar-name" label={t("artists.stageName")} className="sm:col-span-2">
            <Input id="ar-name" name="stageName" defaultValue={artist?.stageName} required maxLength={120} />
          </FormField>
          <FormField id="ar-genres" label={t("artists.genres")} hint={t("artists.genresHint")} className="sm:col-span-2">
            <Input id="ar-genres" name="genres" defaultValue={artist?.genres} maxLength={500} />
          </FormField>
          <FormField id="ar-bio" label={t("artists.bio")} className="sm:col-span-2">
            <Textarea id="ar-bio" name="bio" defaultValue={artist?.bio} rows={4} maxLength={5000} />
          </FormField>
          <FormField id="ar-share" label={t("artists.share")} hint={t("artists.shareHint")}>
            <Input id="ar-share" name="sharePct" defaultValue={artist?.sharePct ?? "40"} inputMode="decimal" required />
          </FormField>
          {!artist && (
            <FormField required id="ar-email" label={t("artists.email")} hint={t("artists.emailHint")}>
              <Input id="ar-email" name="email" type="email" autoComplete="off" required maxLength={191} />
            </FormField>
          )}
          {artist && <FormField id="ar-account" label={t("artists.account")} hint={t("artists.accountHint")}>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger id="ar-account" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ACCOUNT}>{t("artists.noAccount")}</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>}
          <FormField id="ar-media" label={t("artists.media")} hint={t("artists.mediaHint")} className="sm:col-span-2">
            <Textarea id="ar-media" name="mediaLinks" defaultValue={artist?.mediaLinks} rows={3} placeholder="https://www.youtube.com/watch?v=…" />
          </FormField>
          <div className="flex items-center justify-between gap-4 sm:col-span-2">
            <label htmlFor="ar-onpage" className="text-sm font-medium">
              {t("artists.showOnPage")}
            </label>
            <Switch id="ar-onpage" checked={onPage} onCheckedChange={setOnPage} />
          </div>
          {artist && (
            <div className="flex items-center justify-between gap-4 sm:col-span-2">
              <label htmlFor="ar-active" className="text-sm font-medium">
                {t("artists.active")}
              </label>
              <Switch id="ar-active" checked={active} onCheckedChange={setActive} />
            </div>
          )}
          <DialogFooter className="sm:col-span-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("ui.secondary")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {t("artists.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PhotoUpload({ artistId }: { artistId: string }) {
  const t = useTranslations("artists");
  const input = useRef<HTMLInputElement>(null);
  const [pending, run] = useRun();
  return (
    <form action={(form) => run(() => uploadArtistPhotoAction(artistId, form))}>
      <input
        ref={input}
        name="photo"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label={t("uploadPhoto")}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      />
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => input.current?.click()}>
        <ImageUpIcon />
        {t("uploadPhoto")}
      </Button>
    </form>
  );
}

export function UnavailableDates({ artistId, dates, today }: { artistId: string; dates: string[]; today: string }) {
  const t = useTranslations("artists");
  const format = useFormatter();
  const [date, setDate] = useState("");
  const [pending, run] = useRun();

  return (
    <div className="grid gap-3">
      <form
        className="flex flex-wrap gap-2"
        action={() => {
          if (date) run(() => setUnavailableAction(artistId, date, true), () => setDate(""));
        }}
      >
        <DatePicker min={today} value={date} onChange={setDate} className="w-44" aria-label={t("addDate")} />
        <Button type="submit" variant="outline" disabled={pending || !date}>
          {t("addDate")}
        </Button>
      </form>
      {dates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noDates")}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {dates.map((d) => (
            <li key={d} className="flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-3 text-sm">
              {eventDate(format, d, "short")}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`${t("removeDate")} ${d}`}
                disabled={pending}
                onClick={() => run(() => setUnavailableAction(artistId, d, false))}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const shareTone: Record<string, Tone> = { pending: "warning", accepted: "success", declined: "danger", revoked: "neutral" };

export function Sharing({ artistId, shares }: { artistId: string; shares: { id: string; agency: string; status: string }[] }) {
  const t = useTranslations("artists");
  const [slug, setSlug] = useState("");
  const [pending, run] = useRun();

  return (
    <div className="grid gap-3">
      <form className="flex flex-wrap items-end gap-2" action={() => {
          if (slug) run(() => shareArtistAction(artistId, slug), () => setSlug(""));
        }}>
        <FormField required id="share-slug" label={t("partnerSlug")} hint={t("partnerSlugHint")} className="min-w-56 flex-1">
          <Input required id="share-slug" value={slug} onChange={(e) => setSlug(e.target.value)} maxLength={191} />
        </FormField>
        <Button type="submit" variant="outline" disabled={pending || !slug.trim()} className="mb-5">
          {t("shareSend")}
        </Button>
      </form>
      {shares.length > 0 && (
        <ul className="divide-y text-sm">
          {shares.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="flex items-center gap-2">
                {s.agency}
                <Pill tone={shareTone[s.status] ?? "neutral"}>{t(`shareStatus_${s.status as "pending"}`)}</Pill>
              </span>
              {(s.status === "pending" || s.status === "accepted") && (
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => revokeShareAction(s.id))}>
                  {t("shareRevoke")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ShareResponse({ shareId }: { shareId: string }) {
  const t = useTranslations("artists");
  const [pending, run] = useRun();
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => run(() => respondShareAction(shareId, true))}>
        {t("shareAccept")}
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => respondShareAction(shareId, false))}>
        {t("shareDecline")}
      </Button>
    </div>
  );
}
