"use client";

import { FileTextIcon, ImageIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import type { InvoiceNumbering, InvoiceTemplate } from "@stagedesk/core";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions";
import { removeInvoiceBackgroundAction, saveInvoiceSettingsAction, uploadInvoiceBackgroundAction } from "./actions";

/** Invoice numbering (scheme, prefix, typed numbers) and the look of invoices and quotes. */
export function InvoiceSettingsForm({
  initial,
  nextNumber,
  previewHref,
}: {
  initial: { invoiceNumbering: InvoiceNumbering; invoicePrefix: string; allowManualInvoiceNumbers: boolean; template: InvoiceTemplate };
  /** The number the next invoice gets with the saved settings. */
  nextNumber: string;
  previewHref: string;
}) {
  const t = useTranslations("invoiceSettings");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [numbering, setNumbering] = useState(initial.invoiceNumbering);
  const [prefix, setPrefix] = useState(initial.invoicePrefix);
  const [manual, setManual] = useState(initial.allowManualInvoiceNumbers);
  const [tpl, setTpl] = useState(initial.template);
  const file = useRef<HTMLInputElement>(null);
  const set = <K extends keyof InvoiceTemplate>(key: K, value: InvoiceTemplate[K]) => setTpl((x) => ({ ...x, [key]: value }));

  const done = (result: ActionResult) => {
    if (!result.ok) return void toast.error(result.message);
    toast.success(result.message);
    router.refresh();
  };

  function save() {
    const { backgroundUrl: _bg, ...template } = tpl;
    start(async () => done(await saveInvoiceSettingsAction({ invoiceNumbering: numbering, invoicePrefix: prefix, allowManualInvoiceNumbers: manual, template })));
  }

  function upload(f: File | undefined) {
    if (!f) return;
    const form = new FormData();
    form.set("background", f);
    start(async () => done(await uploadInvoiceBackgroundAction(form)));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        <FormField id="inv-numbering" label={t("numbering")} hint={t(`numbering_${numbering}Hint`)}>
          <NativeSelect id="inv-numbering" value={numbering} onChange={(e) => setNumbering(e.target.value as InvoiceNumbering)} className="w-full">
            <option value="yearly">{t("numbering_yearly")}</option>
            <option value="continuous">{t("numbering_continuous")}</option>
          </NativeSelect>
        </FormField>
        <FormField id="inv-prefix" label={t("prefix")} hint={t("prefixHint")}>
          <Input id="inv-prefix" value={prefix} maxLength={12} className="font-mono uppercase" placeholder="FB-" onChange={(e) => setPrefix(e.target.value)} />
        </FormField>
        <p className="text-sm text-muted-foreground sm:col-span-2">
          {t("nextNumber")}: <span className="font-mono text-foreground">{nextNumber}</span> · {t("nextNumberHint")}
        </p>
        <div className="flex items-start justify-between gap-4 rounded-md border p-3 sm:col-span-2">
          <div className="grid gap-1">
            <Label htmlFor="inv-manual">{t("manual")}</Label>
            <p className="text-xs text-muted-foreground">{t("manualHint")}</p>
          </div>
          <Switch id="inv-manual" checked={manual} onCheckedChange={setManual} />
        </div>

        <div className="grid gap-4 border-t pt-4 sm:col-span-2 sm:grid-cols-2">
          <FormField id="inv-accent" label={t("accent")} hint={t("accentHint")}>
            <div className="flex gap-2">
              <Input id="inv-accent" type="color" className="w-14 p-1" value={tpl.accentColor ?? "#5b2a86"} onChange={(e) => set("accentColor", e.target.value)} />
              {tpl.accentColor && (
                <Button type="button" variant="ghost" onClick={() => set("accentColor", null)}>
                  {t("useBrand")}
                </Button>
              )}
            </div>
          </FormField>
          <div className="flex items-start justify-between gap-4 self-end rounded-md border p-3">
            <Label htmlFor="inv-pay">{t("showPayment")}</Label>
            <Switch id="inv-pay" checked={tpl.showPaymentDetails} onCheckedChange={(on) => set("showPaymentDetails", on)} />
          </div>
          <FormField id="inv-header" label={t("headerText")} className="sm:col-span-2">
            <Input id="inv-header" value={tpl.headerText ?? ""} maxLength={300} onChange={(e) => set("headerText", e.target.value || null)} />
          </FormField>
          <FormField id="inv-footer" label={t("footerText")} hint={t("footerTextHint")} className="sm:col-span-2">
            <Textarea id="inv-footer" rows={2} value={tpl.footerText ?? ""} maxLength={600} onChange={(e) => set("footerText", e.target.value || null)} />
          </FormField>

          <div className="grid gap-2 sm:col-span-2">
            <Label>{t("background")}</Label>
            <p className="text-xs text-muted-foreground">{t("backgroundHint")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <input ref={file} type="file" accept="image/png,image/jpeg" className="hidden" aria-label={t("background")} onChange={(e) => upload(e.target.files?.[0])} />
              <Button type="button" variant="outline" disabled={pending} onClick={() => file.current?.click()}>
                <ImageIcon />
                {tpl.backgroundUrl ? t("replaceBackground") : t("uploadBackground")}
              </Button>
              {tpl.backgroundUrl && (
                <Button type="button" variant="ghost" disabled={pending} onClick={() => start(async () => done(await removeInvoiceBackgroundAction()))}>
                  <Trash2Icon />
                  {t("removeBackground")}
                </Button>
              )}
            </div>
          </div>
          {tpl.backgroundUrl && (
            <>
              <FormField id="inv-top" label={t("marginTop")} hint={t("marginHint")}>
                <Input id="inv-top" type="number" min={10} max={90} value={tpl.marginTopMm} onChange={(e) => set("marginTopMm", Math.min(90, Math.max(10, Number(e.target.value) || 17)))} />
              </FormField>
              <FormField id="inv-bottom" label={t("marginBottom")}>
                <Input id="inv-bottom" type="number" min={10} max={60} value={tpl.marginBottomMm} onChange={(e) => set("marginBottomMm", Math.min(60, Math.max(10, Number(e.target.value) || 20)))} />
              </FormField>
              <div className="flex items-start justify-between gap-4 rounded-md border p-3 sm:col-span-2">
                <Label htmlFor="inv-logo">{t("hideLogo")}</Label>
                <Switch id="inv-logo" checked={tpl.hideLogo} onCheckedChange={(on) => set("hideLogo", on)} />
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button onClick={save} disabled={pending}>
            {t("save")}
          </Button>
          <Button variant="outline" asChild>
            <a href={previewHref} target="_blank" rel="noopener">
              <FileTextIcon />
              {t("preview")}
            </a>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2">{t("issuedUnchanged")}</p>
      </CardContent>
    </Card>
  );
}
