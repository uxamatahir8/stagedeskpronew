"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { SettingValue } from "@stagedesk/core";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { saveSettingAction } from "./actions";

/**
 * The platform's own request form (/request): off until there are enough
 * agencies, then started with a few event types or places.
 */
export function MarketplaceForm({ value, eventTypes }: { value: SettingValue<"marketplace">; eventTypes: { key: string; label: string }[] }) {
  const t = useTranslations("marketplaceSettings");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [enabled, setEnabled] = useState(value.enabled);
  const [types, setTypes] = useState<string[]>(value.eventTypes);
  const [regions, setRegions] = useState(value.regions.join("\n"));

  function save() {
    const list = [...new Set(regions.split(/[\n,]/).map((r) => r.trim()).filter(Boolean))];
    start(async () => {
      const r = await saveSettingAction("marketplace", { enabled, eventTypes: types, regions: list });
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.message);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="market-enabled" className="grid gap-0.5 text-sm">
            <span>{t("enabled")}</span>
            <span className="text-xs text-muted-foreground">{enabled ? t("enabledOn") : t("enabledOff")}</span>
          </label>
          <Switch id="market-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <fieldset className="grid gap-2" disabled={!enabled}>
          <legend className="text-sm font-medium">{t("eventTypes")}</legend>
          <p className="text-xs text-muted-foreground">{t("eventTypesHint")}</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
            {eventTypes.map((type) => (
              <label key={type.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={types.includes(type.key)}
                  onChange={(e) => setTypes(e.target.checked ? [...types, type.key] : types.filter((k) => k !== type.key))}
                />
                {type.label}
              </label>
            ))}
          </div>
        </fieldset>
        <FormField id="market-regions" label={t("regions")} hint={t("regionsHint")}>
          <Textarea id="market-regions" rows={3} value={regions} disabled={!enabled} onChange={(e) => setRegions(e.target.value)} placeholder={t("regionsPlaceholder")} />
        </FormField>
        <Button className="w-fit" disabled={pending} onClick={save}>
          {t("save")}
        </Button>
      </CardContent>
    </Card>
  );
}
