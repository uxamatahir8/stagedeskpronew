"use client";

import { PencilIcon, PlusIcon, Trash2Icon, WandSparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { equipmentConditions, type EquipmentKind, type EquipmentSpecs, type EquipmentTracking } from "@stagedesk/core";
import { createItemsAction, saveItemAction, suggestCodeAction, suggestCodesAction } from "@/app/[locale]/app/inventory/actions";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";

export interface ItemFormValues {
  id: string;
  code: string;
  name: string;
  kind: EquipmentKind;
  tracking: EquipmentTracking;
  quantity: number;
  condition: string;
  categoryId: string | null;
  containerId: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  powerWatts: number | null;
  batteryPowered: boolean;
  specs: EquipmentSpecs;
  notes: string | null;
  excludeFromSharing: boolean;
  /** Used on a gig or holding items: kind and tracking can't change. */
  locked: boolean;
}

const NONE = "none";
const MAX_BATCH = 100;

/** One device when several identical ones are added at once. */
interface Unit {
  code: string;
  serialNumber: string;
  notes: string;
}

/** Create or edit one piece of equipment, a case, a set or counted stock. */
export function ItemFormDialog({
  item,
  categories,
  containers,
}: {
  item?: ItemFormValues;
  categories: { id: string; name: string }[];
  containers: { id: string; code: string; name: string; kind: string }[];
}) {
  const t = useTranslations("inventory");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [code, setCode] = useState(item?.code ?? "");
  const [kind, setKind] = useState<EquipmentKind>(item?.kind ?? "item");
  const [tracking, setTracking] = useState<EquipmentTracking>(item?.tracking ?? "unit");
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? NONE);
  const [containerId, setContainerId] = useState(item?.containerId ?? NONE);
  const [condition, setCondition] = useState(item?.condition ?? "good");
  const [battery, setBattery] = useState(item?.batteryPowered ?? false);
  const [excluded, setExcluded] = useState(item?.excludeFromSharing ?? false);
  const [specs, setSpecs] = useState<EquipmentSpecs>(item?.specs ?? []);
  const bulk = kind === "item" && tracking === "bulk";
  const canContain = kind === "item" && tracking === "unit";
  // New numbered devices: how many identical ones to add, each with its own number and serial.
  const batchable = !item && kind !== "set" && !bulk;
  const [count, setCount] = useState("1");
  const [units, setUnits] = useState<Unit[]>([]);
  const howMany = batchable ? Math.max(1, Math.min(MAX_BATCH, Math.trunc(Number(count)) || 1)) : 1;
  const batch = howMany > 1;

  /** Resizes the device rows, numbering new rows after the highest number in use for the prefix. */
  function changeCount(value: string) {
    setCount(value);
    const n = Math.max(1, Math.min(MAX_BATCH, Math.trunc(Number(value)) || 1));
    if (n <= 1) return setUnits([]);
    const prefix = code.split("-")[0] || categories.find((c) => c.id === categoryId)?.name || "EQ";
    start(async () => {
      const suggested = await suggestCodesAction(prefix.slice(0, 12), n);
      setUnits((current) => suggested.map((c, i) => current[i] ?? { code: c, serialNumber: "", notes: "" }));
    });
  }
  const setUnit = (i: number, patch: Partial<Unit>) => setUnits((us) => us.map((u, j) => (j === i ? { ...u, ...patch } : u)));

  function suggest() {
    const prefix = code.split("-")[0] || categories.find((c) => c.id === categoryId)?.name || "EQ";
    start(async () => setCode(await suggestCodeAction(prefix.slice(0, 3))));
  }

  function save(form: FormData) {
    const text = (k: string) => String(form.get(k) ?? "").trim() || null;
    const watts = text("powerWatts");
    const shared = {
      name: text("name") ?? "",
      kind,
      tracking: kind === "item" ? tracking : "unit",
      quantity: 1,
      condition,
      categoryId: categoryId === NONE ? null : categoryId,
      containerId: canContain && containerId !== NONE ? containerId : null,
      manufacturer: text("manufacturer"),
      model: text("model"),
      powerWatts: watts === null ? null : Number(watts),
      batteryPowered: battery,
      specs: specs.filter((s) => s.label.trim() && s.value.trim()),
      notes: text("notes"),
      excludeFromSharing: excluded,
    };
    if (batch) {
      start(async () => {
        const result = await createItemsAction(
          shared,
          units.map((u) => ({ code: u.code, serialNumber: u.serialNumber.trim() || null, notes: u.notes.trim() || null })),
        );
        if (!result.ok) return void toast.error(result.message);
        toast.success(result.message);
        setOpen(false);
        router.refresh();
      });
      return;
    }
    start(async () => {
      const result = await saveItemAction(item?.id ?? null, {
        code,
        name: text("name") ?? "",
        kind,
        tracking: kind === "item" ? tracking : "unit",
        quantity: bulk ? Number(form.get("quantity") || 1) : 1,
        condition,
        categoryId: categoryId === NONE ? null : categoryId,
        containerId: canContain && containerId !== NONE ? containerId : null,
        manufacturer: text("manufacturer"),
        model: text("model"),
        serialNumber: bulk || kind === "set" ? null : text("serialNumber"),
        powerWatts: watts === null ? null : Number(watts),
        batteryPowered: battery,
        specs: specs.filter((s) => s.label.trim() && s.value.trim()),
        notes: text("notes"),
        excludeFromSharing: excluded,
      });
      if (!result.ok) return void toast.error(result.message);
      toast.success(result.message);
      setOpen(false);
      if (!item && result.id) router.push(`/app/inventory/${result.id}`);
      else router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {item ? (
          <Button variant="outline">
            <PencilIcon />
            {t("edit")}
          </Button>
        ) : (
          <Button>
            <PlusIcon />
            {t("add")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? t("edit") : t("add")}</DialogTitle>
          <DialogDescription>{t("formHint")}</DialogDescription>
        </DialogHeader>
        <form action={save} className="grid gap-4 sm:grid-cols-2">
          <FormField required id="eq-kind" label={t("kind")}>
            <NativeSelect id="eq-kind" value={kind} onChange={(e) => setKind(e.target.value as EquipmentKind)} disabled={item?.locked} className="w-full">
              {(["item", "case", "set"] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`kind_${k}`)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          {kind === "item" ? (
            <FormField required id="eq-tracking" label={t("tracking")} hint={t(`tracking_${tracking}Hint`)}>
              <NativeSelect id="eq-tracking" value={tracking} onChange={(e) => setTracking(e.target.value as EquipmentTracking)} disabled={item?.locked} className="w-full">
                {(["unit", "bulk"] as const).map((k) => (
                  <option key={k} value={k}>
                    {t(`tracking_${k}`)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          ) : (
            <p className="self-end text-sm text-muted-foreground">{t(`kind_${kind}Hint`)}</p>
          )}
          {batchable && (
            <FormField id="eq-count" label={t("howMany")} hint={t("howManyHint")}>
              <Input id="eq-count" type="number" min={1} max={MAX_BATCH} value={count} inputMode="numeric" onChange={(e) => changeCount(e.target.value)} />
            </FormField>
          )}
          {!batch && <FormField id="eq-code" label={t("code")} hint={t("codeHint")}>
            <div className="flex gap-2">
              <Input id="eq-code" value={code} onChange={(e) => setCode(e.target.value)} required maxLength={32} className="font-mono uppercase" autoComplete="off" />
              <Button type="button" variant="outline" size="icon" onClick={suggest} disabled={pending} aria-label={t("suggestCode")} title={t("suggestCode")}>
                <WandSparklesIcon />
              </Button>
            </div>
          </FormField>}
          <FormField id="eq-name" label={t("name")}>
            <Input id="eq-name" name="name" defaultValue={item?.name} required maxLength={191} />
          </FormField>
          {bulk && (
            <FormField id="eq-qty" label={t("quantity")} hint={t("quantityHint")}>
              <Input id="eq-qty" name="quantity" type="number" min={1} max={100000} defaultValue={item?.quantity ?? 1} required inputMode="numeric" />
            </FormField>
          )}
          <FormField id="eq-cat" label={t("category")}>
            <NativeSelect id="eq-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full">
              <option value={NONE}>{t("noCategory")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          {canContain && containers.length > 0 && (
            <FormField id="eq-container" label={t("container")} hint={t("containerHint")}>
              <NativeSelect id="eq-container" value={containerId} onChange={(e) => setContainerId(e.target.value)} className="w-full">
                <option value={NONE}>{t("noContainer")}</option>
                {containers
                  .filter((c) => c.id !== item?.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {`${c.code} · ${c.name} (${t(`kind_${c.kind as "case"}`)})`}
                    </option>
                  ))}
              </NativeSelect>
            </FormField>
          )}
          {kind !== "set" && (
            <>
              <FormField id="eq-make" label={t("manufacturer")}>
                <Input id="eq-make" name="manufacturer" defaultValue={item?.manufacturer ?? ""} maxLength={96} />
              </FormField>
              <FormField id="eq-model" label={t("model")}>
                <Input id="eq-model" name="model" defaultValue={item?.model ?? ""} maxLength={96} />
              </FormField>
              {!bulk && !batch && (
                <FormField id="eq-serial" label={t("serialNumber")} hint={t("privateHint")}>
                  <Input id="eq-serial" name="serialNumber" defaultValue={item?.serialNumber ?? ""} maxLength={96} />
                </FormField>
              )}
              <FormField id="eq-watts" label={t("powerWatts")}>
                <Input id="eq-watts" name="powerWatts" type="number" min={0} max={100000} defaultValue={item?.powerWatts ?? ""} inputMode="numeric" />
              </FormField>
              <FormField id="eq-condition" label={t("condition")} hint={t("conditionHint")}>
                <NativeSelect id="eq-condition" value={condition} onChange={(e) => setCondition(e.target.value)} className="w-full">
                  {equipmentConditions.map((c) => (
                    <option key={c} value={c}>
                      {t(`condition_${c}`)}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <div className="flex items-center justify-between gap-3 self-end rounded-md border px-3 py-2">
                <Label htmlFor="eq-battery">{t("batteryPowered")}</Label>
                <Switch id="eq-battery" checked={battery} onCheckedChange={setBattery} />
              </div>
            </>
          )}

          {batch && (
            <fieldset className="grid gap-2 sm:col-span-2">
              <legend className="mb-1 text-sm font-medium">{t("devices", { count: units.length || howMany })}</legend>
              <p className="text-xs text-muted-foreground">{t("devicesHint")}</p>
              <div className="grid max-h-80 gap-2 overflow-y-auto pr-1">
                {units.map((u, i) => (
                  <div key={i} className="grid grid-cols-[2.5rem_1fr_1fr] items-center gap-2 sm:grid-cols-[2.5rem_1fr_1fr_1fr]">
                    <span className="text-right text-xs text-muted-foreground tabular-nums">{i + 1}.</span>
                    <Input aria-label={t("deviceCode", { n: i + 1 })} value={u.code} required maxLength={32} className="font-mono uppercase" onChange={(e) => setUnit(i, { code: e.target.value })} />
                    <Input aria-label={t("deviceSerial", { n: i + 1 })} placeholder={t("serialNumber")} value={u.serialNumber} maxLength={96} onChange={(e) => setUnit(i, { serialNumber: e.target.value })} />
                    <Input aria-label={t("deviceNote", { n: i + 1 })} placeholder={t("deviceNotePlaceholder")} value={u.notes} maxLength={500} className="col-span-2 col-start-2 sm:col-span-1 sm:col-start-auto" onChange={(e) => setUnit(i, { notes: e.target.value })} />
                  </div>
                ))}
              </div>
            </fieldset>
          )}

          <div className="grid gap-2 sm:col-span-2">
            <div className="flex items-center justify-between">
              <Label>{t("specs")}</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSpecs((s) => [...s, { label: "", value: "" }])} disabled={specs.length >= 30}>
                <PlusIcon />
                {t("addSpec")}
              </Button>
            </div>
            {specs.length === 0 && <p className="text-sm text-muted-foreground">{t("specsHint")}</p>}
            {specs.map((spec, i) => (
              <div key={i} className="grid grid-cols-[1fr_1.5fr_auto] gap-2">
                <Input aria-label={t("specLabel")} placeholder={t("specLabel")} value={spec.label} maxLength={60} onChange={(e) => setSpecs((s) => s.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <Input aria-label={t("specValue")} placeholder={t("specValue")} value={spec.value} maxLength={160} onChange={(e) => setSpecs((s) => s.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                <Button type="button" variant="ghost" size="icon" aria-label={t("removeSpec")} onClick={() => setSpecs((s) => s.filter((_, j) => j !== i))}>
                  <Trash2Icon />
                </Button>
              </div>
            ))}
          </div>

          <FormField id="eq-notes" label={t("notes")} hint={t("privateHint")} className="sm:col-span-2">
            <Textarea id="eq-notes" name="notes" defaultValue={item?.notes ?? ""} rows={3} maxLength={5000} />
          </FormField>
          {kind !== "set" && (
            <div className="flex items-start justify-between gap-4 rounded-md border p-3 sm:col-span-2">
              <div className="grid gap-1">
                <Label htmlFor="eq-excluded">{t("excludeFromSharing")}</Label>
                <p className="text-xs text-muted-foreground">{t("excludeFromSharingHint")}</p>
              </div>
              <Switch id="eq-excluded" checked={excluded} onCheckedChange={setExcluded} />
            </div>
          )}
          <DialogFooter className="sm:col-span-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || (batch && units.length !== howMany)}>
              {batch ? t("saveBatch", { count: howMany }) : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
