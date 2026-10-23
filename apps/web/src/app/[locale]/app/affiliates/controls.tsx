"use client";

import { BanIcon, CheckIcon, EllipsisIcon, PencilIcon, PercentIcon, PlusIcon, SendIcon, Trash2Icon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions";
import { deleteAssetAction, payNowAction, reviewCommissionAction, saveAssetAction, setAffiliateRateAction, setAffiliateStatusAction } from "./actions";

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

export function AffiliateMenu({ affiliateId, name, status, ratePercent, canPay }: { affiliateId: string; name: string; status: string; ratePercent: string; canPay: boolean }) {
  const t = useTranslations("affiliatesAdmin");
  const [pending, run] = useRun();
  const [rateOpen, setRateOpen] = useState(false);
  const [rate, setRate] = useState(ratePercent);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t("actions", { name })} disabled={pending}>
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setRateOpen(true)}>
            <PercentIcon />
            {t("setRate")}
          </DropdownMenuItem>
          {canPay && (
            <DropdownMenuItem onSelect={() => run(() => payNowAction(affiliateId))}>
              <SendIcon />
              {t("payNow")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {status === "approved" ? (
            <DropdownMenuItem variant="destructive" onSelect={() => run(() => setAffiliateStatusAction(affiliateId, "suspended"))}>
              <BanIcon />
              {t("suspend")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => run(() => setAffiliateStatusAction(affiliateId, "approved"))}>
              <CheckIcon />
              {t("reactivate")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={rateOpen} onOpenChange={setRateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("rateTitle", { name })}</DialogTitle>
            <DialogDescription>{t("rateHint")}</DialogDescription>
          </DialogHeader>
          <FormField id={`rate-${affiliateId}`} label={t("ratePercent")}>
            <Input id={`rate-${affiliateId}`} inputMode="decimal" value={rate} placeholder={t("rateTiers")} onChange={(e) => setRate(e.target.value)} />
          </FormField>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t("cancel")}</Button>
            </DialogClose>
            <Button disabled={pending} onClick={() => run(() => setAffiliateRateAction(affiliateId, rate), () => setRateOpen(false))}>
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
