"use client";

import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deletePackageAction, savePackageAction } from "@/app/[locale]/app/inventory/actions";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";

type Line = { key: string; target: string; quantity: number };
type Option = { id: string; code: string; name: string; kind: string; tracking: string };

/** A target is "item:<id>" or "category:<id>". */
const parseTarget = (target: string) => {
  const [type, id] = target.split(":");
  return { itemId: type === "item" ? (id ?? null) : null, categoryId: type === "category" ? (id ?? null) : null };
};

/**
 * Builds a reusable package: specific items (counted stock with a quantity)
 * or "n from a category", picked from free equipment when applied.
 */
export function PackageEditor({
  pkg,
  items,
  categories,
  canManage,
}: {
  pkg: { id: string; name: string; description: string | null; lines: { itemId: string | null; categoryId: string | null; quantity: number }[] } | null;
  items: Option[];
  categories: { id: string; name: string }[];
  canManage: boolean;
}) {
  const t = useTranslations("inventory");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [lines, setLines] = useState<Line[]>(
    (pkg?.lines ?? []).map((l, i) => ({ key: String(i), target: l.itemId ? `item:${l.itemId}` : `category:${l.categoryId}`, quantity: l.quantity })),
  );
  const itemById = new Map(items.map((i) => [i.id, i]));

  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const move = (index: number, by: number) =>
    setLines((ls) => {
      const next = [...ls];
      const [moved] = next.splice(index, 1);
      next.splice(index + by, 0, moved!);
      return next;
    });

  function save(form: FormData) {
    start(async () => {
      const result = await savePackageAction(pkg?.id ?? null, {
        name: String(form.get("name") ?? ""),
        description: String(form.get("description") ?? "") || null,
        lines: lines.filter((l) => l.target).map((l) => ({ ...parseTarget(l.target), quantity: l.quantity })),
      });
      if (!result.ok) return void toast.error(result.message);
      toast.success(result.message);
      if (!pkg && result.id) router.push(`/app/inventory/packages/${result.id}`);
      else router.refresh();
    });
  }

  function remove() {
    if (!pkg || !window.confirm(t("deletePackageConfirm", { name: pkg.name }))) return;
    start(async () => {
      const result = await deletePackageAction(pkg.id);
      if (!result.ok) return void toast.error(result.message);
      toast.success(result.message);
      router.push("/app/inventory/packages");
    });
  }

  return (
    <form action={save} className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="pkg-name" label={t("packageName")}>
          <Input id="pkg-name" name="name" defaultValue={pkg?.name} required maxLength={120} disabled={!canManage} />
        </FormField>
        <FormField id="pkg-desc" label={t("packageDescription")} className="sm:col-span-2">
          <Textarea id="pkg-desc" name="description" defaultValue={pkg?.description ?? ""} rows={2} maxLength={2000} disabled={!canManage} />
        </FormField>
      </div>

      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">{t("packageLines")}</h2>
          {canManage && (
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { key: crypto.randomUUID(), target: "", quantity: 1 }])}>
              <PlusIcon />
              {t("addLine")}
            </Button>
          )}
        </div>
        {lines.length === 0 && <p className="text-sm text-muted-foreground">{t("noLines")}</p>}
        <ol className="grid gap-2">
          {lines.map((line, i) => {
            const item = line.target.startsWith("item:") ? itemById.get(line.target.slice(5)) : undefined;
            const fixedOne = item && item.tracking === "unit";
            return (
              <li key={line.key} className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] items-center gap-2 rounded-lg border p-2">
                <NativeSelect aria-label={t("lineTarget")} value={line.target} onChange={(e) => update(line.key, { target: e.target.value })} disabled={!canManage} className="w-full min-w-0">
                  {categories.map((c) => (
                    <option key={`c${c.id}`} value={`category:${c.id}`}>
                      {t("anyFromCategory", { category: c.name })}
                    </option>
                  ))}
                  {items.map((it) => (
                    <option key={it.id} value={`item:${it.id}`}>
                      {`${it.code} · ${it.name}${it.kind !== "item" ? ` (${t(`kind_${it.kind as "case"}`)})` : ""}`}
                    </option>
                  ))}
                </NativeSelect>
                <Input
                  type="number"
                  aria-label={t("quantity")}
                  min={1}
                  max={10000}
                  value={fixedOne ? 1 : line.quantity}
                  disabled={!canManage || fixedOne}
                  onChange={(e) => update(line.key, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                />
                {canManage && (
                  <div className="flex">
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={t("moveUp")} disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUpIcon />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={t("moveDown")} disabled={i === lines.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDownIcon />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={t("removeLine")} onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}>
                      <Trash2Icon />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <p className="text-xs text-muted-foreground">{t("packageHint")}</p>
      </div>

      {canManage && (
        <div className="flex flex-wrap justify-between gap-2">
          <Button type="submit" disabled={pending}>
            {t("save")}
          </Button>
          {pkg && (
            <Button type="button" variant="ghost" disabled={pending} onClick={remove}>
              <Trash2Icon />
              {t("delete")}
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
