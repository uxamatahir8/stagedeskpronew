"use client";

import { ArrowDownIcon, ArrowUpIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deleteCategoryAction, moveCategoryAction, saveCategoryAction } from "./actions";

export interface CategoryRow {
  id: string;
  slug: string;
  nameNl: string;
  nameEn: string;
  descriptionNl: string;
  descriptionEn: string;
  count: number;
}

const blank = { id: null as string | null, slug: "", nameNl: "", nameEn: "", descriptionNl: "", descriptionEn: "" };
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

/** Blog or help categories: add, rename, reorder and remove. */
export function CategoryManager({ kind, categories }: { kind: "blog" | "help"; categories: CategoryRow[] }) {
  const t = useTranslations("contentAdmin");
  const [editing, setEditing] = useState<typeof blank | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [pending, start] = useTransition();

  const run = (task: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) =>
    start(async () => {
      const r = await task();
      if (r.message) (r.ok ? toast.success : toast.error)(r.message);
      if (r.ok) after?.();
    });

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>{t("categories")}</CardTitle>
        <CardDescription>{t(`categoriesHint_${kind}`)}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {categories.length === 0 && <p className="text-sm text-muted-foreground">{t("noCategories")}</p>}
        <ul className="grid gap-1">
          {categories.map((c, i) => (
            <li key={c.id} className="flex items-center gap-1 rounded-md py-1 pr-1 pl-2 hover:bg-muted/60">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{c.nameNl}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {c.nameEn} · {t("articleCount", { count: c.count })}
                </span>
              </span>
              <Button variant="ghost" size="icon" className="size-7" disabled={pending || i === 0} aria-label={t("moveUp")} onClick={() => run(() => moveCategoryAction(c.id, -1))}>
                <ArrowUpIcon />
              </Button>
              <Button variant="ghost" size="icon" className="size-7" disabled={pending || i === categories.length - 1} aria-label={t("moveDown")} onClick={() => run(() => moveCategoryAction(c.id, 1))}>
                <ArrowDownIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={t("editCategory")}
                onClick={() => {
                  setEditing({ id: c.id, slug: c.slug, nameNl: c.nameNl, nameEn: c.nameEn, descriptionNl: c.descriptionNl, descriptionEn: c.descriptionEn });
                  setSlugTouched(true);
                }}
              >
                <PencilIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-destructive"
                disabled={pending}
                aria-label={t("deleteCategory")}
                onClick={() => {
                  if (window.confirm(t("deleteCategoryConfirm", { name: c.nameNl }))) run(() => deleteCategoryAction(c.id));
                }}
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
        <Button
          variant="outline"
          className="w-fit"
          onClick={() => {
            setEditing({ ...blank });
            setSlugTouched(false);
          }}
        >
          <PlusIcon />
          {t("addCategory")}
        </Button>
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? t("editCategory") : t("addCategory")}</DialogTitle>
            <DialogDescription>{t("categoryDialogHint")}</DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              id="category-form"
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                const { id, ...input } = editing;
                run(() => saveCategoryAction(kind, id, input), () => setEditing(null));
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="cat-name-nl" label={t("nameNl")}>
                  <Input
                    id="cat-name-nl"
                    required
                    maxLength={80}
                    value={editing.nameNl}
                    onChange={(e) => setEditing({ ...editing, nameNl: e.target.value, slug: slugTouched ? editing.slug : slugify(e.target.value) })}
                  />
                </FormField>
                <FormField id="cat-name-en" label={t("nameEn")}>
                  <Input id="cat-name-en" required maxLength={80} value={editing.nameEn} onChange={(e) => setEditing({ ...editing, nameEn: e.target.value })} />
                </FormField>
              </div>
              <FormField id="cat-slug" label={t("slug")} hint={kind === "blog" ? `/blog/category/${editing.slug || "…"}` : `/help#${editing.slug || "…"}`}>
                <Input
                  id="cat-slug"
                  required
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  maxLength={80}
                  value={editing.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setEditing({ ...editing, slug: e.target.value.toLowerCase() });
                  }}
                  className="font-mono"
                />
              </FormField>
              <FormField id="cat-desc-nl" label={t("descriptionNl")}>
                <Textarea id="cat-desc-nl" rows={2} maxLength={300} value={editing.descriptionNl} onChange={(e) => setEditing({ ...editing, descriptionNl: e.target.value })} />
              </FormField>
              <FormField id="cat-desc-en" label={t("descriptionEn")}>
                <Textarea id="cat-desc-en" rows={2} maxLength={300} value={editing.descriptionEn} onChange={(e) => setEditing({ ...editing, descriptionEn: e.target.value })} />
              </FormField>
            </form>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              {t("cancel")}
            </Button>
            <Button type="submit" form="category-form" disabled={pending}>
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
