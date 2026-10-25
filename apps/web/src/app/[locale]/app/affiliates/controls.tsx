"use client";

import { BanIcon, CheckIcon, EllipsisIcon, PencilIcon, PlusIcon, SendIcon, Trash2Icon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions";
import {
  createPartnerAction,
  deleteAssetAction,
  deletePartnerAction,
  payNowAction,
  reviewCommissionAction,
  saveAssetAction,
  setAffiliateStatusAction,
  updatePartnerAction,
} from "./actions";

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (task: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      const r = await task();
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.message);
      after?.();
      router.refresh();
    });
  return [pending, run] as const;
}

export function ApplicationButtons({ affiliateId }: { affiliateId: string }) {
  const t = useTranslations("affiliatesAdmin");
  const [pending, run] = useRun();
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={pending} onClick={() => run(() => setAffiliateStatusAction(affiliateId, "approved"))}>
        <CheckIcon />
        {t("approve")}
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setAffiliateStatusAction(affiliateId, "rejected"))}>
        <XIcon />
        {t("reject")}
      </Button>
    </div>
  );
}

export interface PartnerValues {
  code: string;
  promoCode: string;
  website: string;
  pitch: string;
  ratePercent: string;
}

export function AffiliateMenu({ affiliateId, name, status, canPay, values }: { affiliateId: string; name: string; status: string; canPay: boolean; values: PartnerValues }) {
  const t = useTranslations("affiliatesAdmin");
  const [pending, run] = useRun();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [v, setV] = useState(values);
  const field = (key: keyof PartnerValues, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <FormField id={`pe-${key}-${affiliateId}`} label={label}>
      <Input id={`pe-${key}-${affiliateId}`} value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} {...props} />
    </FormField>
  );
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t("actions", { name })} disabled={pending}>
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <PencilIcon />
            {t("edit")}
          </DropdownMenuItem>
          {canPay && (
            <DropdownMenuItem onSelect={() => run(() => payNowAction(affiliateId))}>
              <SendIcon />
              {t("payNow")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {status === "approved" ? (
            <DropdownMenuItem onSelect={() => run(() => setAffiliateStatusAction(affiliateId, "suspended"))}>
              <BanIcon />
              {t("suspend")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => run(() => setAffiliateStatusAction(affiliateId, "approved"))}>
              <CheckIcon />
              {t("reactivate")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
            <Trash2Icon />
            {t("deletePartner")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("editTitle", { name })}</DialogTitle>
            <DialogDescription>{t("editHint")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("code", t("linkCode"), { maxLength: 24 })}
            {field("promoCode", t("promoCode"), { maxLength: 24, className: "uppercase" })}
            {field("website", t("website"), { maxLength: 191 })}
            {field("ratePercent", t("ratePercent"), { inputMode: "decimal", placeholder: t("rateTiers") })}
            <FormField id={`pe-pitch-${affiliateId}`} label={t("pitch")} className="sm:col-span-2">
              <Textarea id={`pe-pitch-${affiliateId}`} rows={3} value={v.pitch} maxLength={2000} onChange={(e) => setV({ ...v, pitch: e.target.value })} />
            </FormField>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t("cancel")}</Button>
            </DialogClose>
            <Button disabled={pending} onClick={() => run(() => updatePartnerAction(affiliateId, v), () => setEditOpen(false))}>
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle", { name })}</DialogTitle>
            <DialogDescription>{t("deleteHint")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t("cancel")}</Button>
            </DialogClose>
            <Button variant="destructive" disabled={pending} onClick={() => run(() => deletePartnerAction(affiliateId), () => setDeleteOpen(false))}>
              {t("deletePartner")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Adds a partner directly, approved straight away (no application needed). */
export function CreatePartnerDialog() {
  const t = useTranslations("affiliatesAdmin");
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: "", email: "", code: "", website: "", ratePercent: "", locale: "en" as "nl" | "en", sendEmail: true });
  const [pending, run] = useRun();
  const field = (key: "name" | "email" | "code" | "website" | "ratePercent", label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <FormField id={`np-${key}`} label={label}>
      <Input id={`np-${key}`} value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} {...props} />
    </FormField>
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon />
          {t("addPartner")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("addPartner")}</DialogTitle>
          <DialogDescription>{t("addPartnerHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("name", t("name"), { maxLength: 191 })}
          {field("email", t("email"), { type: "email" })}
          {field("code", t("linkCode"), { maxLength: 24, placeholder: t("codeAuto") })}
          {field("ratePercent", t("ratePercent"), { inputMode: "decimal", placeholder: t("rateTiers") })}
          {field("website", t("website"), { maxLength: 191 })}
          <FormField id="np-locale" label={t("language")}>
            <Select value={v.locale} onValueChange={(l) => setV({ ...v, locale: l as "nl" | "en" })}>
              <SelectTrigger id="np-locale" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nl">Nederlands</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <label htmlFor="np-send" className="text-sm">
              {t("sendWelcome")}
            </label>
            <Switch id="np-send" checked={v.sendEmail} onCheckedChange={(c) => setV({ ...v, sendEmail: c })} />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("cancel")}</Button>
          </DialogClose>
          <Button disabled={pending} onClick={() => run(() => createPartnerAction(v), () => setOpen(false))}>
            {t("addPartner")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReviewButtons({ commissionId }: { commissionId: string }) {
  const t = useTranslations("affiliatesAdmin");
  const [pending, run] = useRun();
  return (
    <div className="flex justify-end gap-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => reviewCommissionAction(commissionId, false))}>
        {t("cancelCommission")}
      </Button>
      <Button size="sm" disabled={pending} onClick={() => run(() => reviewCommissionAction(commissionId, true))}>
        {t("approve")}
      </Button>
    </div>
  );
}

export interface AssetValues {
  id: string | null;
  kind: "logo" | "banner" | "email" | "video" | "other";
  titleNl: string;
  titleEn: string;
  descriptionNl: string;
  descriptionEn: string;
  url: string;
}

const kinds = ["logo", "banner", "email", "video", "other"] as const;

export function AssetDialog({ asset }: { asset?: AssetValues }) {
  const t = useTranslations("affiliatesAdmin");
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<AssetValues>(asset ?? { id: null, kind: "logo", titleNl: "", titleEn: "", descriptionNl: "", descriptionEn: "", url: "" });
  const [pending, run] = useRun();
  const field = (key: Exclude<keyof AssetValues, "id" | "kind">, label: string) => (
    <FormField id={`asset-${key}`} label={label}>
      <Input id={`asset-${key}`} value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} />
    </FormField>
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {asset ? (
          <Button variant="ghost" size="icon-sm" aria-label={t("editAsset")}>
            <PencilIcon />
          </Button>
        ) : (
          <Button size="sm" variant="outline">
            <PlusIcon />
            {t("addAsset")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{asset ? t("editAsset") : t("addAsset")}</DialogTitle>
          <DialogDescription>{t("assetHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="asset-kind" label={t("assetKind")}>
            <Select value={v.kind} onValueChange={(k) => setV({ ...v, kind: k as AssetValues["kind"] })}>
              <SelectTrigger id="asset-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {kinds.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`kind_${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          {field("url", t("assetUrl"))}
          {field("titleNl", t("titleNl"))}
          {field("titleEn", t("titleEn"))}
          {field("descriptionNl", t("descriptionNl"))}
          {field("descriptionEn", t("descriptionEn"))}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("cancel")}</Button>
          </DialogClose>
          <Button disabled={pending} onClick={() => run(() => saveAssetAction(v), () => setOpen(false))}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteAssetButton({ id }: { id: string }) {
  const t = useTranslations("affiliatesAdmin");
  const [pending, run] = useRun();
  return (
    <Button variant="ghost" size="icon-sm" aria-label={t("deleteAsset")} disabled={pending} onClick={() => run(() => deleteAssetAction(id))}>
      <Trash2Icon />
    </Button>
  );
}
