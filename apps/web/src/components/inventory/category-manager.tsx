"use client";

import { ArrowDownIcon, ArrowUpIcon, CheckIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteCategoryAction, reorderCategoriesAction, saveCategoryAction } from "@/app/[locale]/app/inventory/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions";

/** The agency's own equipment categories: add, rename, reorder, and delete the unused ones. */
export function CategoryManager({ categories, canManage }: { categories: { id: string; name: string; items: number }[]; canManage: boolean }) {
  const t = useTranslations("inventory");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [name, setName] = useState("");

  const run = (action: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const result = await action();
      if (!result.ok) return void toast.error(result.message);
      after?.();
      router.refresh();
    });

  const move = (index: number, by: number) => {
    const ids = categories.map((c) => c.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + by, 0, moved!);
    run(() => reorderCategoriesAction(ids));
  };

  return (
    <div className="grid gap-4">
      {canManage && (
        <form
          className="flex gap-2"
          action={() => run(() => saveCategoryAction(null, name), () => setName(""))}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("newCategory")} aria-label={t("newCategory")} maxLength={96} required />
          <Button type="submit" disabled={pending}>
            <PlusIcon />
            {t("addCategory")}
          </Button>
        </form>
      )}
      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noCategories")}</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {categories.map((c, i) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              {editing === c.id ? (
                <form className="flex flex-1 gap-2" action={() => run(() => saveCategoryAction(c.id, draft), () => setEditing(null))}>
                  <Input value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={t("categoryName")} maxLength={96} required autoFocus />
                  <Button type="submit" size="icon" disabled={pending} aria-label={t("save")}>
                    <CheckIcon />
                  </Button>
                </form>
              ) : (
                <Link href={`/app/inventory?category=${c.id}`} className="grid gap-0.5 underline-offset-4 hover:underline">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{t("itemsCount", { count: c.items })}</span>
                </Link>
              )}
              {canManage && editing !== c.id && (
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label={t("moveUp")} disabled={pending || i === 0} onClick={() => move(i, -1)}>
                    <ArrowUpIcon />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={t("moveDown")} disabled={pending || i === categories.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("rename")}
                    onClick={() => {
                      setEditing(c.id);
                      setDraft(c.name);
                    }}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("delete")}
                    disabled={pending}
                    onClick={() => window.confirm(t("deleteCategoryConfirm", { name: c.name })) && run(() => deleteCategoryAction(c.id))}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
