"use client";

import { ImageUpIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions";
import { saveSoloProfileAction, uploadSoloPhotoAction } from "./actions";

export type SoloProfileValues = { stageName: string; headline: string; bio: string; genres: string; mediaLinks: string; priceFrom: string; photoUrl: string | null };

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (task: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await task();
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.message);
      router.refresh();
    });
  return { pending, run };
}

/** What customers see about the artist: on their quotes, and in the directory with the Artist plan. */
export function SoloProfileForm({ initial, currency }: { initial: SoloProfileValues; currency: string }) {
  const t = useTranslations("artistProfile");
  const { pending, run } = useRun();
  const [v, setV] = useState(initial);
  const photo = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<SoloProfileValues>) => setV((x) => ({ ...x, ...patch }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profileTitle")}</CardTitle>
        <CardDescription>{t("profileHint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex size-24 items-center justify-center overflow-hidden rounded-2xl border bg-muted">
            {initial.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- served from /files
              <img src={initial.photoUrl} alt={initial.stageName} className="size-full object-cover" />
            ) : (
              <span className="text-3xl font-bold text-primary">{initial.stageName.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <form action={(form) => run(() => uploadSoloPhotoAction(form))} className="grid gap-1">
            <input
              ref={photo}
              type="file"
              name="photo"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              aria-label={t("photo")}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            />
            <Button type="button" variant="outline" disabled={pending} onClick={() => photo.current?.click()}>
              <ImageUpIcon />
              {initial.photoUrl ? t("changePhoto") : t("addPhoto")}
            </Button>
            <span className="text-xs text-muted-foreground">{t("photoHint")}</span>
          </form>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField required id="sp-name" label={t("stageName")}>
            <Input id="sp-name" value={v.stageName} maxLength={120} onChange={(e) => set({ stageName: e.target.value })} />
          </FormField>
          <FormField id="sp-price" label={t("priceFrom", { currency })} hint={t("priceFromHint")}>
            <Input id="sp-price" value={v.priceFrom} inputMode="decimal" placeholder="750" onChange={(e) => set({ priceFrom: e.target.value })} />
          </FormField>
          <FormField id="sp-headline" label={t("headline")} hint={t("headlineHint")} className="sm:col-span-2">
            <Input id="sp-headline" value={v.headline} maxLength={160} placeholder={t("headlinePlaceholder")} onChange={(e) => set({ headline: e.target.value })} />
          </FormField>
          <FormField id="sp-genres" label={t("genres")} hint={t("genresHint")} className="sm:col-span-2">
            <Input id="sp-genres" value={v.genres} maxLength={500} onChange={(e) => set({ genres: e.target.value })} />
          </FormField>
          <FormField id="sp-bio" label={t("bio")} className="sm:col-span-2">
            <Textarea id="sp-bio" value={v.bio} rows={6} maxLength={5000} onChange={(e) => set({ bio: e.target.value })} />
          </FormField>
          <FormField id="sp-media" label={t("media")} hint={t("mediaHint")} className="sm:col-span-2">
            <Textarea id="sp-media" value={v.mediaLinks} rows={3} maxLength={2000} placeholder="https://www.youtube.com/watch?v=…" onChange={(e) => set({ mediaLinks: e.target.value })} />
          </FormField>
        </div>
        <div>
          <Button disabled={pending || !v.stageName.trim()} onClick={() => run(() => saveSoloProfileAction({ stageName: v.stageName, headline: v.headline, bio: v.bio, genres: v.genres, mediaLinks: v.mediaLinks, priceFrom: v.priceFrom }))}>
            {t("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
