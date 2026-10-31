"use client";

import { ArchiveIcon, ArchiveRestoreIcon, CircleCheckIcon, PackageMinusIcon, PackagePlusIcon, SearchCheckIcon, Trash2Icon, TriangleAlertIcon, WrenchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  changeDefectiveAction,
  deleteItemAction,
  markFoundAction,
  markLostAction,
  restoreAction,
  retireAction,
  setContainerAction,
  setStatusAction,
} from "@/app/[locale]/app/inventory/actions";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions";

/** A button that opens a dialog asking for an optional note (and a quantity), then runs the action. */
function NoteAction({
  label,
  title,
  description,
  icon: Icon,
  quantity,
  variant = "outline",
  requireNote = false,
  run,
}: {
  label: string;
  title: string;
  description?: string;
  icon: React.ComponentType;
  /** Max for a quantity field; leave out for numbered items. */
  quantity?: number;
  variant?: "outline" | "destructive";
  requireNote?: boolean;
  /** `release` is true when the user confirmed releasing reservations the change breaks. */
  run: (quantity: number, note: string | null, release: boolean) => Promise<ActionResult & { releasable?: boolean }>;
}) {
  const t = useTranslations("inventory");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function submit(form: FormData) {
    const note = String(form.get("note") ?? "").trim() || null;
    const n = quantity ? Number(form.get("quantity") || 1) : 1;
    start(async () => {
      let result = await run(n, note, false);
      // Upcoming gigs have it reserved: only on explicit confirmation are those reservations released.
      if (!result.ok && result.releasable && window.confirm(t("releaseConfirm", { message: result.message ?? "" }))) result = await run(n, note, true);
      if (!result.ok) return void toast.error(result.message);
      if (result.message) toast.success(result.message);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm">
          <Icon />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form action={submit} className="grid gap-4">
          {quantity !== undefined && (
            <FormField id="act-qty" label={t("quantity")}>
              <Input id="act-qty" name="quantity" type="number" min={1} max={Math.max(1, quantity)} defaultValue={1} required inputMode="numeric" />
            </FormField>
          )}
          <FormField id="act-note" label={requireNote ? t("note") : t("noteOptional")}>
            <Textarea id="act-note" name="note" rows={2} maxLength={500} required={requireNote} />
          </FormField>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" variant={variant === "destructive" ? "destructive" : "default"} disabled={pending}>
              {label}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface ItemActionsProps {
  id: string;
  code: string;
  kind: string;
  tracking: string;
  status: string;
  quantity: number;
  defectiveQty: number;
  out: number;
  hasHistory: boolean;
  canManage: boolean;
  canAdmin: boolean;
}

/** What can be done with one item, depending on what it is and its status. */
export function ItemActions(p: ItemActionsProps) {
  const t = useTranslations("inventory");
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!p.canManage) return null;
  const bulk = p.tracking === "bulk";
  const inStock = p.quantity - p.defectiveQty - p.out;

  const simple = (action: () => Promise<ActionResult>, confirmText?: string) => () => {
    if (confirmText && !window.confirm(confirmText)) return;
    start(async () => {
      const result = await action();
      if (!result.ok) return void toast.error(result.message);
      if (result.message) toast.success(result.message);
      if (action === deleteNow) router.push("/app/inventory");
      else router.refresh();
    });
  };
  const deleteNow = () => deleteItemAction(p.id);

  if (p.status === "retired") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={pending} onClick={simple(() => restoreAction(p.id))}>
          <ArchiveRestoreIcon />
          {t("restore")}
        </Button>
        {!p.hasHistory && (
          <Button variant="destructive" size="sm" disabled={pending} onClick={simple(deleteNow, t("deleteConfirm", { code: p.code }))}>
            <Trash2Icon />
            {t("delete")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {p.kind !== "set" && !bulk && p.status === "available" && (
        <>
          <NoteAction label={t("toMaintenance")} title={t("toMaintenance")} icon={WrenchIcon} run={(_, note, release) => setStatusAction(p.id, "maintenance", note, release)} />
          <NoteAction label={t("toDefective")} title={t("toDefective")} icon={TriangleAlertIcon} run={(_, note, release) => setStatusAction(p.id, "defective", note, release)} />
        </>
      )}
      {p.kind !== "set" && (p.status === "maintenance" || p.status === "defective") && (
        <NoteAction label={p.status === "defective" ? t("repaired") : t("backInService")} title={p.status === "defective" ? t("repaired") : t("backInService")} icon={CircleCheckIcon} run={(_, note) => setStatusAction(p.id, "available", note)} />
      )}
      {bulk && p.status === "available" && (
        <>
          {inStock > 0 && <NoteAction label={t("unitsDamaged")} title={t("unitsDamaged")} description={t("unitsDamagedHint")} quantity={inStock} icon={TriangleAlertIcon} run={(n, note, release) => changeDefectiveAction(p.id, n, note, release)} />}
          {p.defectiveQty > 0 && <NoteAction label={t("unitsRepaired")} title={t("unitsRepaired")} quantity={p.defectiveQty} icon={CircleCheckIcon} run={(n, note) => changeDefectiveAction(p.id, -n, note)} />}
        </>
      )}
      {p.kind !== "set" && p.canAdmin && p.status !== "lost" && (bulk ? inStock > 0 : p.out === 0) && (
        <NoteAction
          label={t("markLost")}
          title={t("markLost")}
          description={t("markLostHint")}
          quantity={bulk ? inStock : undefined}
          icon={PackageMinusIcon}
          variant="destructive"
          requireNote
          run={(n, note, release) => markLostAction(p.id, n, note, release)}
        />
      )}
      {p.kind !== "set" && (bulk || p.status === "lost") && (
        <NoteAction label={t("markFound")} title={t("markFound")} description={t("markFoundHint")} quantity={bulk ? 100000 : undefined} icon={bulk ? PackagePlusIcon : SearchCheckIcon} run={(n, note) => markFoundAction(p.id, n, note)} />
      )}
      <NoteAction label={t("retire")} title={t("retire")} description={t("retireHint")} icon={ArchiveIcon} run={(_, note) => retireAction(p.id, note)} />
      {!p.hasHistory && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={simple(deleteNow, t("deleteConfirm", { code: p.code }))}>
          <Trash2Icon />
          {t("delete")}
        </Button>
      )}
    </div>
  );
}

/** Adds loose numbered items to a case or set, or takes one out. */
export function ContentsEditor({ containerId, contents, candidates }: { containerId: string; contents: { id: string; code: string; name: string }[]; candidates: { id: string; code: string; name: string }[] }) {
  const t = useTranslations("inventory");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState("pick");

  const run = (action: () => Promise<ActionResult>) =>
    start(async () => {
      const result = await action();
      if (!result.ok) return void toast.error(result.message);
      setChosen("pick");
      router.refresh();
    });

  return (
    <div className="grid gap-3">
      {contents.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noContents")}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {contents.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span>
                <span className="font-mono">{c.code}</span> · {c.name}
              </span>
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setContainerAction([c.id], null))}>
                {t("takeOut")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {candidates.length > 0 && (
        <div className="flex gap-2">
          <NativeSelect aria-label={t("addToContainer")} value={chosen} onChange={(e) => setChosen(e.target.value)} className="w-full min-w-0">
            <option value="pick" disabled>
              {t("addToContainer")}
            </option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>{`${c.code} · ${c.name}`}</option>
            ))}
          </NativeSelect>
          <Button variant="outline" disabled={pending || chosen === "pick"} onClick={() => run(() => setContainerAction([chosen], containerId))}>
            {t("putIn")}
          </Button>
        </div>
      )}
    </div>
  );
}
