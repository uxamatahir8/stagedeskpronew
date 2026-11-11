"use client";

import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createPartnerAction } from "@/app/[locale]/app/affiliates/actions";
import { createAgencyAction } from "@/app/[locale]/app/agencies/actions";
import { createIndependentArtistAction } from "@/app/[locale]/app/independent-artists/actions";
import { createPlatformArtistAction } from "@/app/[locale]/app/platform-artists/actions";
import { addAgencyCustomerAction, addAgencyMemberAction, createPlatformAdminAction } from "@/app/[locale]/app/users/actions";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions";

export const addableRoles = ["agency_owner", "agency_admin", "agency_staff", "artist", "solo_artist", "customer", "affiliate", "platform_admin"] as const;
export type AddableRole = (typeof addableRoles)[number];

export interface AgencyOption {
  id: string;
  name: string;
  /** agency, or solo for an independent artist's business (they can have customers, not staff). */
  kind: string;
}

const PLATFORM = "platform";
const empty = { name: "", email: "", locale: "nl" as "nl" | "en", organizationId: "", agencyName: "", city: "", stageName: "", genres: "", phone: "", website: "", payType: "percentage" as "percentage" | "fixed", payValue: "40" };

/**
 * One dialog for every kind of account a platform admin can make. Each role
 * goes through the same action as its own admin page (agencies, artists,
 * partners…), so the checks, emails and audit entries are the same.
 */
export function AddUserDialog({ roles = addableRoles, agencies = [], label }: { roles?: readonly AddableRole[]; agencies?: AgencyOption[]; label?: string }) {
  const t = useTranslations("addUser");
  const tr = useTranslations("roles");
  const tl = useTranslations("languages");
  const ta = useTranslations("artists");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<AddableRole>(roles[0] ?? "agency_owner");
  const [v, setV] = useState(empty);
  const set = (patch: Partial<typeof empty>) => setV((x) => ({ ...x, ...patch }));

  const needsAgency = role === "agency_admin" || role === "agency_staff" || role === "customer" || role === "artist";
  const agencyChoices = agencies.filter((a) => (role === "customer" ? a.kind === "agency" || a.kind === "solo" : a.kind === "agency"));
  const artistLike = role === "artist" || role === "solo_artist";

  const submit = () => {
    const base = { name: v.name, email: v.email, locale: v.locale };
    const task: Record<AddableRole, () => Promise<ActionResult>> = {
      platform_admin: () => createPlatformAdminAction(base),
      agency_owner: () => createAgencyAction({ name: v.agencyName, city: v.city, ownerName: v.name, ownerEmail: v.email, locale: v.locale, sendEmail: true }),
      agency_admin: () => addAgencyMemberAction({ ...base, organizationId: v.organizationId, role: "agency_admin" }),
      agency_staff: () => addAgencyMemberAction({ ...base, organizationId: v.organizationId, role: "agency_staff" }),
      artist: () => createPlatformArtistAction({ stageName: v.stageName, email: v.email, organizationId: v.organizationId === PLATFORM ? null : v.organizationId, pay: { type: v.payType, value: v.payValue } }),
      solo_artist: () => createIndependentArtistAction({ ...base, stageName: v.stageName, city: v.city, genres: v.genres }),
      customer: () => addAgencyCustomerAction({ ...base, organizationId: v.organizationId, phone: v.phone }),
      affiliate: () => createPartnerAction({ ...base, code: "", website: v.website, ratePercent: "", sendEmail: true }),
    };
    start(async () => {
      const r = await task[role]();
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.message);
      setOpen(false);
      setV(empty);
      router.refresh();
    });
  };

  const missing =
    !v.email.trim() ||
    (role !== "artist" && !v.name.trim()) ||
    (artistLike && !v.stageName.trim()) ||
    (role === "agency_owner" && !v.agencyName.trim()) ||
    (needsAgency && !v.organizationId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon />
          {label ?? t("open")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{label ?? t("title")}</DialogTitle>
          <DialogDescription>{t(`hint_${role}`)}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {roles.length > 1 && (
            <FormField required id="au-role" label={t("role")} className="sm:col-span-2">
              <Select
                value={role}
                onValueChange={(r) => {
                  setRole(r as AddableRole);
                  set({ organizationId: "" });
                }}
              >
                <SelectTrigger id="au-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r === "artist" ? t("roleAgencyArtist") : tr(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}

          {needsAgency && (
            <FormField required id="au-agency" label={role === "customer" ? t("customerOf") : t("agency")} className="sm:col-span-2">
              <Select value={v.organizationId} onValueChange={(id) => set({ organizationId: id })}>
                <SelectTrigger id="au-agency" className="w-full">
                  <SelectValue placeholder={t("chooseAgency")} />
                </SelectTrigger>
                <SelectContent>
                  {role === "artist" && <SelectItem value={PLATFORM}>{t("managedPool")}</SelectItem>}
                  {agencyChoices.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.kind === "solo" ? t("independentBusiness", { name: a.name }) : a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}

          {role === "agency_owner" && (
            <>
              <FormField required id="au-agency-name" label={t("agencyName")}>
                <Input id="au-agency-name" value={v.agencyName} maxLength={191} onChange={(e) => set({ agencyName: e.target.value })} />
              </FormField>
              <FormField id="au-agency-city" label={t("city")}>
                <Input id="au-agency-city" value={v.city} maxLength={96} onChange={(e) => set({ city: e.target.value })} />
              </FormField>
            </>
          )}

          {artistLike && (
            <FormField required id="au-stage" label={t("stageName")} className="sm:col-span-2">
              <Input id="au-stage" value={v.stageName} maxLength={120} onChange={(e) => set({ stageName: e.target.value })} />
            </FormField>
          )}
          {role === "artist" && (
            <>
              <FormField id="au-pay" label={ta("payType")} hint={ta(`payType_${v.payType}Hint`)}>
                <Select value={v.payType} onValueChange={(p) => set({ payType: p as "percentage" | "fixed", payValue: p === "fixed" ? "" : "40" })}>
                  <SelectTrigger id="au-pay" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">{ta("payType_percentage")}</SelectItem>
                    <SelectItem value="fixed">{ta("payType_fixed")}</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField id="au-pay-value" label={v.payType === "fixed" ? ta("fixedFee", { currency: "EUR" }) : ta("share")}>
                <Input id="au-pay-value" value={v.payValue} inputMode="decimal" maxLength={12} placeholder={v.payType === "fixed" ? "250,00" : "40"} onChange={(e) => set({ payValue: e.target.value })} />
              </FormField>
            </>
          )}

          {role !== "artist" && (
            <FormField required id="au-name" label={role === "agency_owner" ? t("ownerName") : t("name")} className="sm:col-span-2">
              <Input id="au-name" value={v.name} maxLength={191} autoComplete="off" onChange={(e) => set({ name: e.target.value })} />
            </FormField>
          )}
          <FormField required id="au-email" label={t("email")} className={role === "artist" ? "sm:col-span-2" : ""}>
            <Input id="au-email" type="email" value={v.email} maxLength={191} autoComplete="off" onChange={(e) => set({ email: e.target.value })} />
          </FormField>
          {role !== "artist" && (
            <FormField id="au-locale" label={t("language")}>
              <Select value={v.locale} onValueChange={(l) => set({ locale: l as "nl" | "en" })}>
                <SelectTrigger id="au-locale" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nl">{tl("nl")}</SelectItem>
                  <SelectItem value="en">{tl("en")}</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          )}

          {role === "solo_artist" && (
            <>
              <FormField id="au-solo-city" label={t("city")}>
                <Input id="au-solo-city" value={v.city} maxLength={96} onChange={(e) => set({ city: e.target.value })} />
              </FormField>
              <FormField id="au-genres" label={t("genres")} hint={t("genresHint")}>
                <Input id="au-genres" value={v.genres} maxLength={500} onChange={(e) => set({ genres: e.target.value })} />
              </FormField>
            </>
          )}
          {role === "customer" && (
            <FormField id="au-phone" label={t("phone")}>
              <Input id="au-phone" type="tel" value={v.phone} maxLength={32} onChange={(e) => set({ phone: e.target.value })} />
            </FormField>
          )}
          {role === "affiliate" && (
            <FormField id="au-website" label={t("website")}>
              <Input id="au-website" value={v.website} maxLength={191} onChange={(e) => set({ website: e.target.value })} />
            </FormField>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("cancel")}</Button>
          </DialogClose>
          <Button disabled={pending || missing} onClick={submit}>
            {t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
