"use client";

import { HandshakeIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { FeeRule } from "@stagedesk/core";
import { setAgencyFeeAction } from "@/app/[locale]/app/settings/actions";
import { draftToFeeRule, FeeRuleFields, feeRuleToDraft } from "@/components/fee-rule-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "@/i18n/navigation";

export function FeeDealDialog({ organizationId, agency, rule }: { organizationId: string; agency: string; rule: FeeRule | null }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(rule !== null);
  const [draft, setDraft] = useState(feeRuleToDraft(rule, locale));
  const [pending, startTransition] = useTransition();

  function save() {
    const next = custom ? draftToFeeRule(draft) : null;
    if (custom && !next) return void toast.error(t("platformSettings.invalid"));
    startTransition(async () => {
      const r = await setAgencyFeeAction(organizationId, next);
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.message);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={rule ? "secondary" : "ghost"} size="sm">
          <HandshakeIcon />
          {t("agencyFee.deal")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("agencyFee.dealTitle", { agency })}</DialogTitle>
          <DialogDescription>{t("agencyFee.dealHint")}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="deal-custom" className="text-sm">
            {custom ? t("agencyFee.deal") : t("agencyFee.useDefault")}
          </label>
          <Switch id="deal-custom" checked={custom} onCheckedChange={setCustom} />
        </div>
        {custom && <FeeRuleFields value={draft} onChange={setDraft} idPrefix="deal" />}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("ui.secondary")}</Button>
          </DialogClose>
          <Button disabled={pending} onClick={save}>
            {t("platformSettings.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
