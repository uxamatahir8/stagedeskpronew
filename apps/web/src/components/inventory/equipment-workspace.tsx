"use client";

import {
  CheckIcon,
  ClipboardCopyIcon,
  MinusIcon,
  PackageCheckIcon,
  PackageOpenIcon,
  PlusIcon,
  PrinterIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UndoIcon,
  ZapIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import type { EquipmentStage } from "@stagedesk/core";
import {
  addEquipmentAction,
  applyPackageAction,
  confirmLostAction,
  type EquipmentResult,
  finishCheckInAction,
  loadAction,
  loadGroupAction,
  overrideLineAction,
  previewPackageAction,
  removeLineAction,
  retryReservationsAction,
  returnAction,
  returnGroupAction,
  setQuantityAction,
} from "@/app/[locale]/app/bookings/[code]/equipment/actions";
import { FormField } from "@/components/form-field";
import { EquipmentStagePill } from "@/components/inventory/labels";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export interface WorkspaceLine {
  id: string;
  itemId: string;
  code: string;
  name: string;
  kind: string;
  tracking: string;
  category: string | null;
  categoryPosition: number;
  viaContainerId: string | null;
  quantity: number;
  loadedQty: number;
  returnedQty: number;
  damagedQty: number;
  lostQty: number;
  outstanding: number;
  reserved: boolean;
  overrideReason: string | null;
  free: number | null;
  atRisk: boolean;
  loadable: number;
  powerWatts: number | null;
}

export interface WorkspaceProps {
  code: string;
  title: string;
  stage: EquipmentStage;
  reserving: boolean;
  editable: boolean;
  checkedIn: boolean;
  power: number;
  lines: WorkspaceLine[];
  containers: { id: string; code: string; name: string; kind: string }[];
  /** Equipment that can be added (desk only). */
  items: { id: string; label: string; tracking: string; kind: string }[];
  packages: { id: string; name: string }[];
  canPlan: boolean;
  canHandle: boolean;
  canOverride: boolean;
  /** Link to the printable list, if the viewer can open it. */
  printHref?: string;
}

type Preview = Extract<Awaited<ReturnType<typeof previewPackageAction>>, { ok: true }>["preview"];
type Group = { key: string; title: string; container: { id: string; kind: string } | null; lines: WorkspaceLine[] };

function groupLines(lines: WorkspaceLine[], containers: WorkspaceProps["containers"], other: string): Group[] {
  const byContainer = new Map(containers.map((c) => [c.id, c]));
  const groups = new Map<string, Group & { order: number }>();
  for (const line of lines) {
    const container = line.viaContainerId ? byContainer.get(line.viaContainerId) : undefined;
    const key = container ? `c:${container.id}` : `k:${line.category ?? ""}`;
    const title = container ? `${container.code} · ${container.name}` : (line.category ?? other);
    const order = container ? -1 : line.category ? line.categoryPosition : 1e6;
    if (!groups.has(key)) groups.set(key, { key, title, container: container ? { id: container.id, kind: container.kind } : null, lines: [], order });
    groups.get(key)!.lines.push(line);
  }
  return [...groups.values()]
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
    .map((g) => ({ key: g.key, title: g.title, container: g.container, lines: g.lines.sort((a, b) => (a.kind === "case" ? -1 : b.kind === "case" ? 1 : a.code.localeCompare(b.code, "en", { numeric: true }))) }));
}

/** Packing list, loading and returns for one booking. */
export function EquipmentWorkspace(p: WorkspaceProps) {
  const t = useTranslations("equipment");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [overrideFor, setOverrideFor] = useState<null | { message: string; retry: (reason: string) => Promise<EquipmentResult> }>(null);
  const groups = useMemo(() => groupLines(p.lines, p.containers, t("otherEquipment")), [p.lines, p.containers, t]);
  const totals = useMemo(
    () => p.lines.reduce((s, l) => ({ planned: s.planned + l.quantity, loaded: s.loaded + l.loadedQty, out: s.out + l.outstanding, unreserved: s.unreserved + (l.reserved ? 0 : 1) }), { planned: 0, loaded: 0, out: 0, unreserved: 0 }),
    [p.lines],
  );

  /** Runs an action; a refused same-day conflict offers owners and admins the override. */
  const run = (action: () => Promise<EquipmentResult>, retry?: (reason: string) => Promise<EquipmentResult>) =>
    new Promise<boolean>((resolve) =>
      start(async () => {
        const result = await action();
        if (!result.ok) {
          if (result.overridable && retry && p.canOverride) setOverrideFor({ message: result.message ?? "", retry });
          else toast.error(result.message);
          return resolve(false);
        }
        if (result.message) toast.success(result.message);
        router.refresh();
        resolve(true);
      }),
    );

  const text = () =>
    [
      `${t("packingList")} · ${p.title}`,
      "",
      ...groups.flatMap((g) => [g.title, ...g.lines.map((l) => `  ${l.quantity}× ${l.code} ${l.name}`), ""]),
      p.power ? t("powerTotal", { watts: p.power }) : "",
    ]
      .join("\n")
      .trim();

  const copy = async () => {
    await navigator.clipboard.writeText(text());
    toast.success(t("copied"));
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <EquipmentStagePill stage={p.stage} />
          <span className="tabular-nums text-muted-foreground">{t("summary", { planned: totals.planned, loaded: totals.loaded, out: totals.out })}</span>
          {p.power > 0 && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <ZapIcon className="size-4" />
              {t("powerTotal", { watts: p.power })}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={copy} disabled={p.lines.length === 0}>
            <ClipboardCopyIcon />
            {t("copy")}
          </Button>
          {p.printHref && (
            <Button asChild variant="outline" size="sm">
              <Link href={p.printHref} target="_blank">
                <PrinterIcon />
                {t("print")}
              </Link>
            </Button>
          )}
        </div>
      </div>

      {p.reserving && totals.unreserved > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <span className="flex items-center gap-2">
            <TriangleAlertIcon className="size-4 shrink-0" />
            {t("unreservedNotice", { count: totals.unreserved })}
          </span>
          {p.canPlan && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => retryReservationsAction(p.code))}>
              <RefreshCwIcon />
              {t("retry")}
            </Button>
          )}
        </div>
      )}
      {!p.reserving && p.editable && p.lines.length > 0 && <p className="text-sm text-muted-foreground">{t("notReservingYet")}</p>}

      <Tabs defaultValue={p.stage === "returning" || p.stage === "out" || p.stage === "missing" ? "return" : p.stage === "loading" ? "loading" : "packing"}>
        <TabsList>
          <TabsTrigger value="packing">{t("tabPacking")}</TabsTrigger>
          <TabsTrigger value="loading">{t("tabLoading")}</TabsTrigger>
          <TabsTrigger value="return">{t("tabReturn")}</TabsTrigger>
        </TabsList>
        <TabsContent value="packing" className="grid gap-4 pt-2">
          {p.canPlan && p.editable && <AddEquipment {...p} pending={pending} run={run} />}
          <Packing {...p} groups={groups} pending={pending} run={run} onOverride={setOverrideFor} />
        </TabsContent>
        <TabsContent value="loading" className="grid gap-4 pt-2">
          <Loading {...p} groups={groups} pending={pending} run={run} />
        </TabsContent>
        <TabsContent value="return" className="grid gap-4 pt-2">
          <Returning {...p} groups={groups} pending={pending} run={run} />
        </TabsContent>
      </Tabs>

      <OverrideDialog
        state={overrideFor}
        onClose={() => setOverrideFor(null)}
        onSubmit={async (reason) => {
          const retry = overrideFor?.retry;
          setOverrideFor(null);
          if (retry) await run(() => retry(reason));
        }}
      />
    </div>
  );
}

type Run = (action: () => Promise<EquipmentResult>, retry?: (reason: string) => Promise<EquipmentResult>) => Promise<boolean>;
type Section = WorkspaceProps & { groups: Group[]; pending: boolean; run: Run };

function OverrideDialog({ state, onClose, onSubmit }: { state: { message: string } | null; onClose: () => void; onSubmit: (reason: string) => void }) {
  const t = useTranslations("equipment");
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("overrideTitle")}</DialogTitle>
          <DialogDescription>{state?.message}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          action={(form) => {
            const reason = String(form.get("reason") ?? "").trim();
            if (reason) onSubmit(reason);
          }}
        >
          <p className="flex gap-2 rounded-md bg-warning/10 p-2 text-sm">
            <ShieldAlertIcon className="mt-0.5 size-4 shrink-0" />
            {t("overrideWarning")}
          </p>
          <FormField id="override-reason" label={t("overrideReason")}>
            <Textarea id="override-reason" name="reason" rows={2} maxLength={191} required />
          </FormField>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit">{t("overrideConfirm")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddEquipment(p: WorkspaceProps & { pending: boolean; run: Run }) {
  const t = useTranslations("equipment");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [packageId, setPackageId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadingPreview, startPreview] = useTransition();
  const item = p.items.find((i) => i.id === itemId);
  const bulk = item?.tracking === "bulk";

  const add = async () => {
    if (!item) return;
    const qty = bulk ? quantity : 1;
    const ok = await p.run(
      () => addEquipmentAction(p.code, { itemId: item.id, quantity: qty }),
      (reason) => addEquipmentAction(p.code, { itemId: item.id, quantity: qty, reason }),
    );
    if (ok) {
      setItemId("");
      setQuantity(1);
    }
  };

  const openPreview = () =>
    startPreview(async () => {
      const result = await previewPackageAction(p.code, packageId);
      if (!result.ok) return void toast.error(result.message);
      setPreview(result.preview);
    });

  const picks = preview?.lines.flatMap((l) => l.picks.filter((x) => x.status === "ok" && x.itemId).map((x) => ({ itemId: x.itemId!, quantity: x.quantity }))) ?? [];

  return (
    <div className="grid gap-3 rounded-xl border bg-card p-4">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_auto]">
        <NativeSelect aria-label={t("chooseEquipment")} value={itemId} onChange={(e) => setItemId(e.target.value)} className="w-full min-w-0">
          {p.items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </NativeSelect>
        <Input type="number" aria-label={t("quantity")} min={1} max={100000} value={bulk ? quantity : 1} disabled={!bulk} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))} />
        <Button onClick={add} disabled={p.pending || !item}>
          <PlusIcon />
          {t("add")}
        </Button>
      </div>
      {p.packages.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <NativeSelect aria-label={t("choosePackage")} value={packageId} onChange={(e) => setPackageId(e.target.value)} className="w-full min-w-0">
            {p.packages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name}
              </option>
            ))}
          </NativeSelect>
          <Button variant="outline" onClick={openPreview} disabled={!packageId || loadingPreview}>
            <PackageOpenIcon />
            {t("previewPackage")}
          </Button>
        </div>
      )}
      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{preview?.package.name}</DialogTitle>
            <DialogDescription>{preview?.reserving ? t("previewReserving") : t("previewPlanning")}</DialogDescription>
          </DialogHeader>
          <ul className="grid gap-3 text-sm">
            {preview?.lines.map((line) => (
              <li key={line.index} className="grid gap-1 rounded-lg border p-2">
                <span className="font-medium">
                  {line.quantity}× {line.label}
                </span>
                <ul className="grid gap-0.5">
                  {line.picks.map((pick, i) => (
                    <li key={i} className={cn("flex items-center gap-2", pick.status !== "ok" && "text-destructive")}>
                      {pick.status === "ok" ? <CheckIcon className="size-4 text-success" /> : <TriangleAlertIcon className="size-4" />}
                      {pick.status === "ok"
                        ? `${pick.quantity}× ${pick.code} ${pick.name ?? ""}`
                        : t(`pick_${pick.reason}`, { quantity: pick.quantity, code: pick.code ?? "" })}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t("cancel")}</Button>
            </DialogClose>
            <Button
              disabled={p.pending || picks.length === 0}
              onClick={async () => {
                const ok = await p.run(
                  () => applyPackageAction(p.code, preview!.package.id, picks),
                  (reason) => applyPackageAction(p.code, preview!.package.id, picks, reason),
                );
                if (ok) setPreview(null);
              }}
            >
              {t("applyPackage", { count: picks.length })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LineFlags({ line, reserving }: { line: WorkspaceLine; reserving: boolean }) {
  const t = useTranslations("equipment");
  return (
    <span className="flex flex-wrap gap-1">
      {reserving && !line.reserved && <Pill tone="warning">{t("notReserved")}</Pill>}
      {line.overrideReason && (
        <span title={line.overrideReason}>
          <Pill tone="info">{t("overridden")}</Pill>
        </span>
      )}
      {line.atRisk && <Pill tone="danger">{t("atRisk")}</Pill>}
      {!reserving && line.free !== null && line.free < line.quantity && <Pill tone="warning">{t("onlyFree", { free: Math.max(0, line.free) })}</Pill>}
    </span>
  );
}

function GroupTitle({ group, children }: { group: Group; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
      <h3 className="text-sm font-medium">{group.title}</h3>
      {children}
    </div>
  );
}

function Packing(p: Section & { onOverride: (s: { message: string; retry: (reason: string) => Promise<EquipmentResult> }) => void }) {
  const t = useTranslations("equipment");
  if (p.lines.length === 0) return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>;
  return (
    <div className="grid gap-3">
      {p.groups.map((group) => (
        <section key={group.key} className="overflow-hidden rounded-xl border bg-card">
          <GroupTitle group={group} />
          <ul className="divide-y">
            {group.lines.map((line) => (
              <li key={line.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                <div className="grid min-w-0 gap-0.5">
                  <span className="text-sm">
                    <span className="font-mono font-medium">{line.code}</span> {line.name}
                  </span>
                  <LineFlags line={line} reserving={p.reserving} />
                </div>
                <div className="flex items-center gap-2">
                  {p.canPlan && p.editable && line.tracking === "bulk" ? (
                    <QuantityEditor line={line} code={p.code} pending={p.pending} run={p.run} />
                  ) : (
                    <span className="text-sm tabular-nums">{line.quantity}×</span>
                  )}
                  {p.canPlan && p.canOverride && p.reserving && !line.reserved && (
                    <Button size="sm" variant="outline" disabled={p.pending} onClick={() => p.onOverride({ message: t("overrideLineHint", { code: line.code }), retry: (reason) => overrideLineAction(p.code, line.id, reason) })}>
                      {t("override")}
                    </Button>
                  )}
                  {p.canPlan && p.editable && line.loadedQty === 0 && (
                    <Button size="icon-sm" variant="ghost" aria-label={t("remove")} disabled={p.pending} onClick={() => window.confirm(t("removeConfirm", { code: line.code })) && p.run(() => removeLineAction(p.code, line.id))}>
                      <Trash2Icon />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function QuantityEditor({ line, code, pending, run }: { line: WorkspaceLine; code: string; pending: boolean; run: Run }) {
  const t = useTranslations("equipment");
  const [value, setValue] = useState(line.quantity);
  return (
    <span className="flex items-center gap-1">
      <Input type="number" className="h-8 w-20" aria-label={t("quantity")} min={Math.max(1, line.loadedQty)} max={100000} value={value} onChange={(e) => setValue(Math.max(1, Number(e.target.value) || 1))} />
      {value !== line.quantity && (
        <Button size="icon-sm" variant="outline" aria-label={t("save")} disabled={pending} onClick={() => run(() => setQuantityAction(code, line.id, value), (reason) => setQuantityAction(code, line.id, value, reason))}>
          <CheckIcon />
        </Button>
      )}
    </span>
  );
}

/** Find a line by its equipment number ("spk-12" finds SPK-12). */
function NumberSearch({ lines, onFound, label }: { lines: WorkspaceLine[]; onFound: (line: WorkspaceLine) => void; label: string }) {
  const t = useTranslations("equipment");
  const [value, setValue] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const wanted = value.trim().replace(/\s+/g, " ").toUpperCase();
        const line = lines.find((l) => l.code === wanted) ?? lines.find((l) => l.code.startsWith(wanted));
        if (!wanted) return;
        if (!line) return void toast.error(t("numberNotFound", { code: wanted }));
        setValue("");
        onFound(line);
        document.getElementById(`line-${line.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      }}
    >
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={t("numberPlaceholder")} aria-label={label} className="font-mono uppercase placeholder:font-sans placeholder:normal-case" inputMode="text" autoComplete="off" />
      <Button type="submit" variant="outline">
        {label}
      </Button>
    </form>
  );
}

function Loading(p: Section) {
  const t = useTranslations("equipment");
  if (p.lines.length === 0) return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>;
  const handle = p.canHandle && p.reserving;
  const loadOne = (line: WorkspaceLine) => {
    if (line.loadedQty >= line.quantity) return void toast.info(t("alreadyLoaded", { code: line.code }));
    return p.run(() => loadAction(p.code, line.id, 1));
  };
  return (
    <div className="grid gap-3">
      {!p.canHandle && <p className="text-sm text-muted-foreground">{t("readOnly")}</p>}
      {p.canHandle && !p.reserving && <p className="text-sm text-muted-foreground">{t("loadNeedsBooked")}</p>}
      {handle && <NumberSearch lines={p.lines} onFound={loadOne} label={t("loadNumber")} />}
      {p.groups.map((group) => (
        <section key={group.key} className="overflow-hidden rounded-xl border bg-card">
          <GroupTitle group={group}>
            {handle && group.container && group.lines.some((l) => l.loadedQty < l.quantity) && (
              <Button size="sm" variant="outline" disabled={p.pending} onClick={() => p.run(() => loadGroupAction(p.code, group.container!.id))}>
                <PackageCheckIcon />
                {t("loadGroup")}
              </Button>
            )}
          </GroupTitle>
          <ul className="divide-y">
            {group.lines.map((line) => {
              const done = line.loadedQty >= line.quantity;
              const unloadable = line.outstanding > 0;
              return (
                <li key={line.id} id={`line-${line.id}`} className={cn("flex flex-wrap items-center justify-between gap-3 px-3 py-3", done && "bg-success/5")}>
                  <div className="grid min-w-0 gap-0.5">
                    <span className="text-sm">
                      <span className="font-mono font-medium">{line.code}</span> {line.name}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">{t("loadedOf", { loaded: line.loadedQty, planned: line.quantity })}</span>
                    <LineFlags line={line} reserving={p.reserving} />
                  </div>
                  {handle && (
                    <div className="flex items-center gap-1">
                      {line.tracking === "bulk" ? (
                        <>
                          <Button size="icon" variant="outline" aria-label={t("unloadOne")} disabled={p.pending || !unloadable} onClick={() => p.run(() => loadAction(p.code, line.id, -1))}>
                            <MinusIcon />
                          </Button>
                          <Button size="icon" variant="outline" aria-label={t("loadOne")} disabled={p.pending || done || line.loadable < 1} onClick={() => p.run(() => loadAction(p.code, line.id, 1))}>
                            <PlusIcon />
                          </Button>
                          <Button size="sm" disabled={p.pending || done || line.loadable < 1} onClick={() => p.run(() => loadAction(p.code, line.id, Math.min(line.loadable, line.quantity - line.loadedQty)))}>
                            {t("loadAll")}
                          </Button>
                        </>
                      ) : done ? (
                        <Button size="sm" variant="outline" disabled={p.pending || !unloadable} onClick={() => p.run(() => loadAction(p.code, line.id, -1))}>
                          <UndoIcon />
                          {t("unload")}
                        </Button>
                      ) : (
                        <Button size="sm" className="min-w-24" disabled={p.pending || line.loadable < 1} onClick={() => p.run(() => loadAction(p.code, line.id, 1))}>
                          <CheckIcon />
                          {t("load")}
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Returning(p: Section) {
  const t = useTranslations("equipment");
  const [group, setGroup] = useState<Group | null>(null);
  const [lost, setLost] = useState<WorkspaceLine | null>(null);
  const [damaged, setDamaged] = useState<WorkspaceLine | null>(null);
  const loaded = p.lines.filter((l) => l.loadedQty > 0);
  if (loaded.length === 0) return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("nothingLoaded")}</p>;
  const groups = p.groups.map((g) => ({ ...g, lines: g.lines.filter((l) => l.loadedQty > 0) })).filter((g) => g.lines.length > 0);
  const outstanding = loaded.reduce((s, l) => s + l.outstanding, 0);
  const returnOne = (line: WorkspaceLine) => {
    if (line.outstanding < 1) return void toast.info(t("alreadyReturned", { code: line.code }));
    return p.run(() => returnAction(p.code, line.id, { ok: 1, damaged: 0 }));
  };

  return (
    <div className="grid gap-3">
      {!p.canHandle && <p className="text-sm text-muted-foreground">{t("readOnly")}</p>}
      {p.checkedIn && outstanding > 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <TriangleAlertIcon className="size-4 shrink-0" />
          {t("missingNotice", { count: outstanding })}
        </p>
      )}
      {p.canHandle && outstanding > 0 && <NumberSearch lines={loaded} onFound={returnOne} label={t("returnNumber")} />}
      {groups.map((g) => (
        <section key={g.key} className="overflow-hidden rounded-xl border bg-card">
          <GroupTitle group={g}>
            {p.canHandle && g.container && g.lines.some((l) => l.outstanding > 0) && (
              <Button size="sm" variant="outline" disabled={p.pending} onClick={() => setGroup(g)}>
                <PackageCheckIcon />
                {t("checkInGroup")}
              </Button>
            )}
          </GroupTitle>
          <ul className="divide-y">
            {g.lines.map((line) => (
              <li key={line.id} id={`line-${line.id}`} className={cn("flex flex-wrap items-center justify-between gap-3 px-3 py-3", line.outstanding === 0 && "bg-success/5")}>
                <div className="grid min-w-0 gap-0.5">
                  <span className="text-sm">
                    <span className="font-mono font-medium">{line.code}</span> {line.name}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {t("returnCounts", { loaded: line.loadedQty, returned: line.returnedQty, damaged: line.damagedQty, lost: line.lostQty })}
                  </span>
                  {line.outstanding > 0 && <span>{p.checkedIn ? <Pill tone="danger">{t("missing", { count: line.outstanding })}</Pill> : <Pill tone="brand">{t("outstanding", { count: line.outstanding })}</Pill>}</span>}
                </div>
                {line.outstanding > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    {p.canHandle && (
                      <>
                        <Button size="sm" disabled={p.pending} onClick={() => p.run(() => returnAction(p.code, line.id, { ok: line.tracking === "bulk" ? line.outstanding : 1, damaged: 0 }))}>
                          <CheckIcon />
                          {line.tracking === "bulk" ? t("returnedAll", { count: line.outstanding }) : t("returned")}
                        </Button>
                        <Button size="sm" variant="outline" disabled={p.pending} onClick={() => setDamaged(line)}>
                          <TriangleAlertIcon />
                          {t("damaged")}
                        </Button>
                      </>
                    )}
                    {p.canOverride && p.checkedIn && (
                      <Button size="sm" variant="destructive" disabled={p.pending} onClick={() => setLost(line)}>
                        {t("confirmLost")}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {p.canPlan && outstanding > 0 && !p.checkedIn && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 text-sm">
          <span>{t("finishHint", { count: outstanding })}</span>
          <Button variant="outline" disabled={p.pending} onClick={() => window.confirm(t("finishConfirm", { count: outstanding })) && p.run(() => finishCheckInAction(p.code))}>
            {t("finishCheckIn")}
          </Button>
        </div>
      )}
      <GroupReturnDialog code={p.code} group={group} onClose={() => setGroup(null)} run={p.run} />
      <CountDialog
        line={damaged}
        title={t("damagedTitle")}
        description={t("damagedHint")}
        submitLabel={t("recordDamage")}
        requireNote={false}
        onClose={() => setDamaged(null)}
        onSubmit={(line, n, note) => p.run(() => returnAction(p.code, line.id, { ok: 0, damaged: n, note }))}
      />
      <CountDialog
        line={lost}
        title={t("confirmLostTitle")}
        description={t("confirmLostHint")}
        submitLabel={t("confirmLost")}
        requireNote
        destructive
        onClose={() => setLost(null)}
        onSubmit={(line, n, note) => p.run(() => confirmLostAction(p.code, line.id, n, note))}
      />
    </div>
  );
}

function CountDialog({
  line,
  title,
  description,
  submitLabel,
  requireNote,
  destructive,
  onClose,
  onSubmit,
}: {
  line: WorkspaceLine | null;
  title: string;
  description: string;
  submitLabel: string;
  requireNote: boolean;
  destructive?: boolean;
  onClose: () => void;
  onSubmit: (line: WorkspaceLine, quantity: number, note: string | null) => Promise<boolean>;
}) {
  const t = useTranslations("equipment");
  return (
    <Dialog open={line !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {title} · <span className="font-mono">{line?.code}</span>
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          action={async (form) => {
            if (!line) return;
            const n = line.tracking === "bulk" ? Number(form.get("quantity") || 1) : 1;
            const ok = await onSubmit(line, n, String(form.get("note") ?? "").trim() || null);
            if (ok) onClose();
          }}
        >
          {line?.tracking === "bulk" && (
            <FormField id="count-qty" label={t("quantity")}>
              <Input id="count-qty" name="quantity" type="number" min={1} max={line.outstanding} defaultValue={1} required inputMode="numeric" />
            </FormField>
          )}
          <FormField id="count-note" label={requireNote ? t("note") : t("noteOptional")}>
            <Textarea id="count-note" name="note" rows={2} maxLength={500} required={requireNote} />
          </FormField>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" variant={destructive ? "destructive" : "default"}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Checks a case or set back in: tick what's there (and what's damaged); the rest stays outstanding. */
function GroupReturnDialog({ code, group, onClose, run }: { code: string; group: Group | null; onClose: () => void; run: Run }) {
  const t = useTranslations("equipment");
  const lines = group?.lines.filter((l) => l.outstanding > 0 && l.tracking === "unit") ?? [];
  const [present, setPresent] = useState<Record<string, boolean>>({});
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const close = () => {
    setPresent({});
    setBroken({});
    setNote("");
    onClose();
  };
  return (
    <Dialog open={group !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{group?.title}</DialogTitle>
          <DialogDescription>{t("checkInGroupHint")}</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-2">
          {lines.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-2 text-sm">
              <span>
                <span className="font-mono">{l.code}</span> {l.name}
              </span>
              <span className="flex items-center gap-4">
                <span className="flex items-center gap-2">
                  <Switch id={`present-${l.id}`} checked={present[l.id] ?? false} onCheckedChange={(v) => setPresent((s) => ({ ...s, [l.id]: v }))} />
                  <Label htmlFor={`present-${l.id}`}>{t("present")}</Label>
                </span>
                <span className="flex items-center gap-2">
                  <Switch id={`broken-${l.id}`} checked={broken[l.id] ?? false} disabled={!present[l.id]} onCheckedChange={(v) => setBroken((s) => ({ ...s, [l.id]: v }))} />
                  <Label htmlFor={`broken-${l.id}`}>{t("damaged")}</Label>
                </span>
              </span>
            </li>
          ))}
        </ul>
        <FormField id="group-note" label={t("noteOptional")}>
          <Textarea id="group-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {t("cancel")}
          </Button>
          <Button
            disabled={!lines.some((l) => present[l.id])}
            onClick={async () => {
              const chosen = lines.filter((l) => present[l.id]);
              const ok = await run(() =>
                returnGroupAction(code, group!.container!.id, {
                  present: chosen.filter((l) => !broken[l.id]).map((l) => l.id),
                  damaged: chosen.filter((l) => broken[l.id]).map((l) => l.id),
                  note: note.trim() || null,
                }),
              );
              if (ok) close();
            }}
          >
            {t("checkInSelected", { count: lines.filter((l) => present[l.id]).length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
