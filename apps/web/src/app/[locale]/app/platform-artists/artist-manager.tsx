"use client";

import { ArrowRightLeftIcon, LogInIcon, Share2Icon, UserPlusIcon, CalendarPlusIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { startImpersonationAction } from "@/lib/impersonation-actions";
import { createIndependentArtistAction } from "../independent-artists/actions";
import { assignPlatformArtistAction, createPlatformArtistAction, moveArtistAction, sharePlatformArtistAction } from "./actions";

type Option = { id: string; label: string };
type Result = { ok: boolean; message?: string };

const PLATFORM = "";
const INDEPENDENT = "independent";

/** Runs an action, shows its result and refreshes the page; `after` runs only on success. */
function useRun() {
  const t = useTranslations("platformArtists");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (task: () => Promise<Result>, after?: () => void) =>
    startTransition(async () => {
      const result = await task();
      if (!result.ok) return void toast.error(result.message ?? t("invalid"));
      toast.success(result.message);
      after?.();
      router.refresh();
    });
  return { pending, run };
}

/**
 * The admin's tools on the artist list: add an artist (to an agency, the
 * managed pool, or as an independent artist), share one with an agency, and
 * assign one to a booking. Changing an artist's role is on each row of the list.
 */
export function PlatformArtistManager({ artists, agencies, bookings }: { artists: Option[]; agencies: Option[]; bookings: Option[] }) {
  return (
    <div className="grid gap-6">
      <AddArtistCard agencies={agencies} />
      <div className="grid gap-6 lg:grid-cols-2">
        <ShareCard artists={artists} agencies={agencies} />
        <AssignCard artists={artists} bookings={bookings} />
      </div>
    </div>
  );
}

function AddArtistCard({ agencies }: { agencies: Option[] }) {
  const t = useTranslations("platformArtists");
  const ta = useTranslations("artists");
  const locale = useLocale() as "nl" | "en";
  const { pending, run } = useRun();
  const empty = { stageName: "", email: "", worksFor: PLATFORM, payType: "percentage" as "percentage" | "fixed", share: "40", fixed: "" };
  const [v, setV] = useState(empty);
  const set = (patch: Partial<typeof empty>) => setV((x) => ({ ...x, ...patch }));
  const independent = v.worksFor === INDEPENDENT;

  const submit = () =>
    run(
      () =>
        independent
          ? createIndependentArtistAction({ name: v.stageName, email: v.email, stageName: v.stageName, city: "", genres: "", locale })
          : createPlatformArtistAction({
              stageName: v.stageName,
              email: v.email,
              organizationId: v.worksFor || null,
              pay: { type: v.payType, value: v.payType === "fixed" ? v.fixed : v.share },
            }),
      () => setV(empty),
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlusIcon className="size-4 text-primary" aria-hidden />
          {t("add")}
        </CardTitle>
        <CardDescription>{t("addHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <FormField required id="pa-name" label={t("stageName")}>
            <Input id="pa-name" required maxLength={120} value={v.stageName} onChange={(e) => set({ stageName: e.target.value })} />
          </FormField>
          <FormField required id="pa-email" label={t("email")}>
            <Input id="pa-email" required type="email" maxLength={191} autoComplete="off" value={v.email} onChange={(e) => set({ email: e.target.value })} />
          </FormField>
          <FormField id="pa-org" label={t("worksFor")} className="sm:col-span-2">
            <NativeSelect id="pa-org" value={v.worksFor} onChange={(e) => set({ worksFor: e.target.value })} className="w-full">
              <option value={PLATFORM}>{t("ownedByPlatform")}</option>
              <option value={INDEPENDENT}>{t("moveToIndependent")}</option>
              {agencies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>

          {independent ? (
            <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground sm:col-span-2 xl:col-span-4">{t("independentNote")}</p>
          ) : (
            <>
              <FormField id="pa-pay" label={ta("payType")} hint={ta(`payType_${v.payType}Hint`)} className="sm:col-span-2">
                <NativeSelect id="pa-pay" value={v.payType} onChange={(e) => set({ payType: e.target.value as "percentage" | "fixed" })} className="w-full">
                  <option value="percentage">{ta("payType_percentage")}</option>
                  <option value="fixed">{ta("payType_fixed")}</option>
                </NativeSelect>
              </FormField>
              {v.payType === "percentage" ? (
                <FormField required id="pa-share" label={ta("share")} hint={ta("shareHint")}>
                  <Input id="pa-share" required inputMode="decimal" maxLength={6} value={v.share} onChange={(e) => set({ share: e.target.value })} />
                </FormField>
              ) : (
                <FormField required id="pa-fixed" label={ta("fixedFee", { currency: "EUR" })} hint={ta("fixedFeeHint")}>
                  <Input id="pa-fixed" required inputMode="decimal" maxLength={12} placeholder="250,00" value={v.fixed} onChange={(e) => set({ fixed: e.target.value })} />
                </FormField>
              )}
            </>
          )}

          <div className="flex items-end justify-end sm:col-span-2 xl:col-span-4">
            <Button type="submit" disabled={pending || !v.stageName.trim() || !v.email.trim()}>
              {t("createAndInvite")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ShareCard({ artists, agencies }: { artists: Option[]; agencies: Option[] }) {
  const t = useTranslations("platformArtists");
  const { pending, run } = useRun();
  const [artistId, setArtistId] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Share2Icon className="size-4 text-primary" aria-hidden />
          {t("share")}
        </CardTitle>
        <CardDescription>{t("shareHint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <FormField required id="sh-artist" label={t("artist")}>
          <NativeSelect id="sh-artist" value={artistId} onChange={(e) => setArtistId(e.target.value)} className="w-full">
            <option value="" disabled>
              {t("chooseArtist")}
            </option>
            {artists.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField required id="sh-agency" label={t("shareWith")}>
          <NativeSelect id="sh-agency" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} className="w-full">
            <option value="" disabled>
              {t("chooseAgency")}
            </option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <div className="flex justify-end">
          <Button disabled={pending || !artistId || !organizationId} onClick={() => run(() => sharePlatformArtistAction(artistId, organizationId), () => setOrganizationId(""))}>
            {t("shareNow")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AssignCard({ artists, bookings }: { artists: Option[]; bookings: Option[] }) {
  const t = useTranslations("platformArtists");
  const { pending, run } = useRun();
  const [artistId, setArtistId] = useState("");
  const [bookingId, setBookingId] = useState("");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarPlusIcon className="size-4 text-primary" aria-hidden />
          {t("assign")}
        </CardTitle>
        <CardDescription>{t("assignHint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <FormField required id="as-artist" label={t("artist")}>
          <NativeSelect id="as-artist" value={artistId} onChange={(e) => setArtistId(e.target.value)} className="w-full">
            <option value="" disabled>
              {t("chooseArtist")}
            </option>
            {artists.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField required id="as-booking" label={t("booking")}>
          <NativeSelect id="as-booking" value={bookingId} onChange={(e) => setBookingId(e.target.value)} className="w-full">
            <option value="" disabled>
              {t("chooseBooking")}
            </option>
            {bookings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <div className="flex justify-end">
          <Button
            disabled={pending || !artistId || !bookingId}
            onClick={() =>
              run(
                () => assignPlatformArtistAction(artistId, bookingId),
                () => setBookingId(""),
              )
            }
          >
            {t("assignNow")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export type MovableArtist = { id: string; stageName: string; organizationId: string; kind: string; upcoming: number };

/**
 * "Change role" on a row of the artist list: to independent, StageDesk's
 * managed pool or another agency, with or without keeping the current role.
 * Needs a reason (audited).
 */
export function ChangeRoleButton({ artist, agencies }: { artist: MovableArtist; agencies: Option[] }) {
  const t = useTranslations("platformArtists");
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [keepCurrent, setKeepCurrent] = useState(false);
  const [withdraw, setWithdraw] = useState(true);
  const [why, setWhy] = useState("");
  const independent = artist.kind === "solo";
  const reset = () => {
    setOpen(false);
    setTarget("");
    setKeepCurrent(false);
    setWhy("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ArrowRightLeftIcon />
          {t("moveNow")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("moveDialogTitle", { name: artist.stageName })}</DialogTitle>
          <DialogDescription>{t("moveHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FormField required id={`mv-target-${artist.id}`} label={t("moveTo")}>
            <NativeSelect id={`mv-target-${artist.id}`} value={target} onChange={(e) => setTarget(e.target.value)} className="w-full">
              <option value="" disabled>
                {t("moveToChoose")}
              </option>
              {!independent && <option value={INDEPENDENT}>{t("moveToIndependent")}</option>}
              {artist.kind !== "platform" && <option value="platform">{t("ownedByPlatform")}</option>}
              {agencies
                .filter((a) => a.id !== artist.organizationId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
            </NativeSelect>
          </FormField>
          {independent ? (
            <p className="text-sm text-muted-foreground">{t("moveFromIndependent")}</p>
          ) : (
            <div className="flex items-start gap-2">
              <Switch id={`mv-keep-${artist.id}`} checked={keepCurrent} onCheckedChange={setKeepCurrent} />
              <Label htmlFor={`mv-keep-${artist.id}`} className="leading-snug font-normal">
                {t("moveKeepCurrent")}
              </Label>
            </div>
          )}
          {!independent && !keepCurrent && artist.upcoming > 0 && (
            <div className="flex items-start gap-2">
              <Switch id={`mv-withdraw-${artist.id}`} checked={withdraw} onCheckedChange={setWithdraw} />
              <Label htmlFor={`mv-withdraw-${artist.id}`} className="leading-snug font-normal">
                {t("alsoWithdraw", { count: artist.upcoming })}
              </Label>
            </div>
          )}
          <FormField required id={`mv-reason-${artist.id}`} label={t("reason")} hint={t("reasonHint")}>
            <Textarea id={`mv-reason-${artist.id}`} rows={2} maxLength={500} value={why} onChange={(e) => setWhy(e.target.value)} />
          </FormField>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("cancel")}</Button>
          </DialogClose>
          <Button disabled={pending || !target || !why.trim()} onClick={() => run(() => moveArtistAction({ artistId: artist.id, target, keepCurrent, withdraw, reason: why }), reset)}>
            {t("moveNow")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
