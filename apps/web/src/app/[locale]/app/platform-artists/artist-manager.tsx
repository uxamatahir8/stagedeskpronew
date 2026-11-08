"use client";

import { keepValues } from "@/lib/keep-values";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useRouter } from "@/i18n/navigation";
import { assignPlatformArtistAction, createPlatformArtistAction, sharePlatformArtistAction } from "./actions";
import { LogInIcon } from "lucide-react";
import { startImpersonationAction } from "@/lib/impersonation-actions";

type Option = { id: string; label: string };

export function PlatformArtistManager({ artists, agencies, bookings }: { artists: Option[]; agencies: Option[]; bookings: Option[] }) {
  const t = useTranslations("platformArtists");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [artistId, setArtistId] = useState(artists[0]?.id ?? "");

  const run = (task: () => Promise<{ ok: boolean; message?: string }>, reset?: () => void) => startTransition(async () => {
    const result = await task();
    if (!result.ok) return void toast.error(result.message ?? t("invalid"));
    toast.success(result.message);
    reset?.();
    router.refresh();
  });

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <form className="grid gap-3 rounded-xl border bg-card p-5" {...keepValues((form, el) => run(() => createPlatformArtistAction({ stageName: String(form.get("stageName")), email: String(form.get("email")), organizationId: String(form.get("organizationId")) || null, sharePct: Number(form.get("sharePct")) }), () => el?.reset()))}>
        <h2 className="font-semibold">{t("add")}</h2>
        <Input name="stageName" required maxLength={120} placeholder={t("stageName")} />
        <Input name="email" required type="email" maxLength={191} placeholder={t("email")} />
        <NativeSelect name="organizationId" defaultValue="">
          <option value="">{t("ownedByPlatform")}</option>
          {agencies.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </NativeSelect>
        <Input name="sharePct" type="number" min={0} max={100} step="0.01" defaultValue="40" aria-label={t("sharePct")} />
        <Button disabled={pending}>{t("createAndInvite")}</Button>
      </form>

      <form className="grid gap-3 rounded-xl border bg-card p-5" {...keepValues((form, el) => run(() => sharePlatformArtistAction(String(form.get("artistId")), String(form.get("organizationId"))), () => el?.reset()))}>
        <h2 className="font-semibold">{t("share")}</h2>
        <NativeSelect name="artistId" required value={artistId} onChange={(e) => setArtistId(e.target.value)}>{artists.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</NativeSelect>
        <NativeSelect name="organizationId" required defaultValue=""><option value="" disabled>{t("chooseAgency")}</option>{agencies.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</NativeSelect>
        <Button disabled={pending || !artistId}>{t("shareNow")}</Button>
      </form>

      <form className="grid gap-3 rounded-xl border bg-card p-5" {...keepValues((form, el) => run(() => assignPlatformArtistAction(String(form.get("artistId")), String(form.get("bookingId"))), () => el?.reset()))}>
        <h2 className="font-semibold">{t("assign")}</h2>
        <NativeSelect name="artistId" required defaultValue=""><option value="" disabled>{t("chooseArtist")}</option>{artists.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</NativeSelect>
        <NativeSelect name="bookingId" required defaultValue=""><option value="" disabled>{t("chooseBooking")}</option>{bookings.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</NativeSelect>
        <Button disabled={pending}>{t("assignNow")}</Button>
      </form>
    </div>
  );
}

/** "Log in as artist" from the artist list, with the existing impersonation (platform admins only, audited, one hour). */
export function LoginAsArtistButton({ userId }: { userId: string }) {
  const t = useTranslations("platformArtists");
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await startImpersonationAction(userId);
          if (!result.ok) toast.error(result.message);
        })
      }
    >
      <LogInIcon />
      {t("loginAsArtist")}
    </Button>
  );
}
