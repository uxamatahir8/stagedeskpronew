"use client";

import { MapPinIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { type EventType, eventTypes } from "@stagedesk/core";
import { FormField } from "@/components/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "@/i18n/navigation";
import { saveServiceAreaAction } from "./actions";

export type ServiceAreaValues = { acceptsLeads: boolean; regions: string[]; radiusKm: string; eventTypes: string[] | null; located: string | null; ownCity: string | null };

/**
 * Where and what the agency plays: requests from the website reach it when
 * the event is in one of its places or within its radius, for event types
 * it offers.
 */
export function ServiceAreaForm({ initial, action = saveServiceAreaAction }: { initial: ServiceAreaValues; action?: typeof saveServiceAreaAction }) {
  const t = useTranslations("serviceArea");
  const te = useTranslations("eventTypes");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [accepts, setAccepts] = useState(initial.acceptsLeads);
  const [regions, setRegions] = useState(initial.regions);
  const [draft, setDraft] = useState("");
  const [radius, setRadius] = useState(initial.radiusKm);
  const [types, setTypes] = useState<string[] | null>(initial.eventTypes);

  const addRegion = () => {
    const parts = draft.split(/[,;\n]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return;
    setRegions((r) => [...r, ...parts.filter((p) => !r.some((x) => x.toLowerCase() === p.toLowerCase()))].slice(0, 50));
    setDraft("");
  };
  const toggleType = (type: string) => {
    const current = types ?? [...eventTypes];
    const next = current.includes(type) ? current.filter((x) => x !== type) : [...current, type];
    setTypes(next.length === eventTypes.length ? null : next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="sa-accepts" className="text-sm font-medium">
            {t("acceptsLeads")}
            <span className="block text-xs font-normal text-muted-foreground">{t("acceptsLeadsHint")}</span>
          </label>
          <Switch id="sa-accepts" checked={accepts} onCheckedChange={setAccepts} />
        </div>

        <FormField id="sa-region" label={t("regions")} hint={regions.length === 0 && initial.ownCity ? t("regionsEmpty", { city: initial.ownCity }) : t("regionsHint")}>
          <div className="grid gap-2">
            <div className="flex gap-2">
              <Input
                id="sa-region"
                value={draft}
                maxLength={300}
                placeholder={t("regionsPlaceholder")}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addRegion();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addRegion} disabled={!draft.trim()}>
                {t("add")}
              </Button>
            </div>
            {regions.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {regions.map((r) => (
                  <li key={r}>
                    <Badge variant="secondary" className="gap-1 pr-1">
                      {r}
                      <button type="button" className="rounded-full p-0.5 hover:bg-foreground/10" aria-label={t("remove", { region: r })} onClick={() => setRegions((x) => x.filter((y) => y !== r))}>
                        <XIcon className="size-3" />
                      </button>
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </FormField>

        <FormField id="sa-radius" label={t("radius")} hint={initial.located ? t("located", { place: initial.located }) : t("notLocated")}>
          <div className="flex items-center gap-2">
            <Input id="sa-radius" value={radius} inputMode="numeric" maxLength={4} className="w-28" placeholder="0" onChange={(e) => setRadius(e.target.value.replace(/\D/g, ""))} />
            <span className="text-sm text-muted-foreground">km</span>
            {initial.located && <MapPinIcon className="size-4 text-success" aria-label={t("onMap")} />}
          </div>
        </FormField>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">{t("eventTypes")}</legend>
          <div className="flex flex-wrap gap-2">
            {eventTypes.map((type) => {
              const on = types === null || types.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleType(type)}
                  className="rounded-full border px-3 py-1 text-sm transition-colors aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary"
                >
                  {te(type)}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">{types === null ? t("allTypes") : t("someTypes", { count: types.length })}</p>
        </fieldset>

        <div>
          <Button
            disabled={pending || (types !== null && types.length === 0)}
            onClick={() =>
              start(async () => {
                const r = await action({ acceptsLeads: accepts, regions, radiusKm: radius ? Number(radius) : null, eventTypes: types as EventType[] | null });
                if (!r.ok) return void toast.error(r.message);
                toast.success(r.message);
                router.refresh();
              })
            }
          >
            {t("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
