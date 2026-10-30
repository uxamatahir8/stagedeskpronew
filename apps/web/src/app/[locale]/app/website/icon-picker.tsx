"use client";

import { ImageUpIcon, SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { iconKind, siteIcons } from "@stagedesk/core";
import { SiteIconView } from "@/components/sites/site-sections";
import { siteIconComponents } from "@/components/sites/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { uploadSiteImageAction } from "./actions";

/** Picks a section icon: a built-in icon, an emoji, or an uploaded image. */
export function IconPicker({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const t = useTranslations("websiteEditor");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [emoji, setEmoji] = useState("");
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };
  const q = query.trim().toLowerCase();
  const icons = siteIcons.filter((name) => !q || name.toLowerCase().includes(q) || t(`icon_${name}`).toLowerCase().includes(q));

  function upload(file: File) {
    const form = new FormData();
    form.set("image", file);
    startTransition(async () => {
      const r = await uploadSiteImageAction(form);
      if (!r.ok) return void toast.error(r.message);
      pick(r.url);
    });
  }

  return (
    <>
      <button
        id={id}
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 items-center gap-3 rounded-md border bg-background px-3 text-left text-sm transition-colors hover:bg-muted/60"
      >
        <span className="flex size-7 items-center justify-center rounded-md bg-muted text-foreground">{value ? <SiteIconView value={value} className="size-4 text-base" /> : null}</span>
        <span className="flex-1 truncate text-muted-foreground">{iconKind(value) === "builtin" ? t(`icon_${value as (typeof siteIcons)[number]}`) : iconKind(value) === "emoji" ? value : iconKind(value) === "image" ? t("iconCustom") : t("iconNone")}</span>
        <span className="text-xs font-medium">{t("iconChange")}</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("iconTitle")}</DialogTitle>
            <DialogDescription>{t("iconHint")}</DialogDescription>
          </DialogHeader>
          <label className="relative block">
            <span className="sr-only">{t("iconSearch")}</span>
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("iconSearch")} className="pl-9" />
          </label>
          <div className="grid max-h-64 grid-cols-6 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-8" role="listbox" aria-label={t("iconTitle")}>
            {icons.map((name) => {
              const Icon = siteIconComponents[name];
              return (
                <button
                  key={name}
                  type="button"
                  role="option"
                  aria-selected={value === name}
                  title={t(`icon_${name}`)}
                  aria-label={t(`icon_${name}`)}
                  onClick={() => pick(name)}
                  className={cn("flex aspect-square items-center justify-center rounded-md border transition-colors hover:bg-muted", value === name && "border-primary bg-primary/10 text-primary")}
                >
                  <Icon className="size-5" aria-hidden />
                </button>
              );
            })}
          </div>
          <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const v = emoji.trim();
                if (iconKind(v) === "emoji") pick(v);
                else toast.error(t("iconEmojiInvalid"));
              }}
            >
              <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder={t("iconEmoji")} aria-label={t("iconEmoji")} maxLength={16} />
              <Button type="submit" variant="outline">
                {t("iconUse")}
              </Button>
            </form>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" disabled={pending} onClick={() => input.current?.click()}>
                <ImageUpIcon />
                {t("iconUpload")}
              </Button>
              <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              <Button type="button" variant="ghost" onClick={() => pick("")}>
                {t("iconNone")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
