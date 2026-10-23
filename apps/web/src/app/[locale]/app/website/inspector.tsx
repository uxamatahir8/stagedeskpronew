"use client";

import { ArrowDownIcon, ArrowUpIcon, ImageUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { ctaTargets, highlightIcons, type Section, sectionBackgrounds } from "@stagedesk/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { uploadSiteImageAction } from "./actions";

/**
 * What each section type lets the agency change. One list per type drives the
 * form, so a new section type only needs its fields described here.
 */
type Field =
  | { key: string; kind: "text" | "textarea" | "url" | "image"; rows?: number }
  | { key: string; kind: "number"; min: number; max: number }
  | { key: string; kind: "switch" }
  | { key: string; kind: "select"; options: readonly string[] }
  | { key: string; kind: "items"; fields: Field[]; max: number; make: () => Record<string, unknown> };

const background: Field = { key: "background", kind: "select", options: sectionBackgrounds };
const cta: Field[] = [
  { key: "ctaLabel", kind: "text" },
  { key: "ctaTarget", kind: "select", options: ctaTargets },
  { key: "ctaUrl", kind: "url" },
];

const fields: Record<Section["type"], Field[]> = {
  hero: [{ key: "title", kind: "text" }, { key: "subtitle", kind: "textarea", rows: 3 }, { key: "image", kind: "image" }, { key: "align", kind: "select", options: ["center", "left"] }, ...cta, background],
  text: [{ key: "heading", kind: "text" }, { key: "body", kind: "textarea", rows: 10 }, background],
  highlights: [
    { key: "heading", kind: "text" },
    { key: "items", kind: "items", max: 6, make: () => ({ icon: "star", title: "…", body: "" }), fields: [{ key: "icon", kind: "select", options: highlightIcons }, { key: "title", kind: "text" }, { key: "body", kind: "textarea", rows: 2 }] },
    background,
  ],
  artists: [{ key: "heading", kind: "text" }, { key: "intro", kind: "textarea", rows: 2 }, { key: "max", kind: "number", min: 1, max: 24 }, background],
  packages: [{ key: "heading", kind: "text" }, { key: "intro", kind: "textarea", rows: 2 }, { key: "showPrices", kind: "switch" }, background],
  reviews: [{ key: "heading", kind: "text" }, { key: "max", kind: "number", min: 1, max: 12 }, background],
  gallery: [{ key: "heading", kind: "text" }, { key: "images", kind: "items", max: 24, make: () => ({ url: "/brand/mark.png", alt: "" }), fields: [{ key: "url", kind: "image" }, { key: "alt", kind: "text" }] }, background],
  video: [{ key: "heading", kind: "text" }, { key: "url", kind: "url" }, background],
  faq: [{ key: "heading", kind: "text" }, { key: "items", kind: "items", max: 20, make: () => ({ q: "…?", a: "…" }), fields: [{ key: "q", kind: "text" }, { key: "a", kind: "textarea", rows: 3 }] }, background],
  cta: [{ key: "heading", kind: "text" }, { key: "body", kind: "textarea", rows: 2 }, ...cta, background],
  booking: [{ key: "heading", kind: "text" }, { key: "intro", kind: "textarea", rows: 2 }, background],
  contact: [{ key: "heading", kind: "text" }, { key: "intro", kind: "textarea", rows: 2 }, background],
};

type Values = Record<string, unknown>;

export function SectionInspector({ section, onChange }: { section: Section; onChange: (next: Section) => void }) {
  const t = useTranslations("websiteEditor");
  const values = section as unknown as Values;
  const visible = fields[section.type].filter((f) => f.key !== "ctaUrl" || values["ctaTarget"] === "url");
  return (
    <div className="grid gap-4">
      <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{t(`section_${section.type}`)}</p>
      {visible.map((f) => (
        <FieldInput key={f.key} field={f} id={`${section.id}-${f.key}`} value={values[f.key]} onChange={(v) => onChange({ ...section, [f.key]: v } as Section)} />
      ))}
      {section.type === "text" && <p className="text-xs text-muted-foreground">{t("formattingHint")}</p>}
      {(section.type === "artists" || section.type === "packages" || section.type === "reviews") && <p className="text-xs text-muted-foreground">{t(`liveHint_${section.type}`)}</p>}
    </div>
  );
}

function FieldInput({ field, id, value, onChange }: { field: Field; id: string; value: unknown; onChange: (v: unknown) => void }) {
  const t = useTranslations("websiteEditor");
  const label = t(`field_${field.key}` as "field_title");
  switch (field.kind) {
    case "text":
    case "url":
      return (
        <div className="grid gap-1.5">
          <Label htmlFor={id}>{label}</Label>
          <Input id={id} type={field.kind === "url" ? "url" : "text"} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder={field.kind === "url" ? "https://" : undefined} />
        </div>
      );
    case "textarea":
      return (
        <div className="grid gap-1.5">
          <Label htmlFor={id}>{label}</Label>
          <Textarea id={id} rows={field.rows ?? 3} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case "number":
      return (
        <div className="grid gap-1.5">
          <Label htmlFor={id}>{label}</Label>
          <Input id={id} type="number" min={field.min} max={field.max} value={Number(value ?? field.min)} onChange={(e) => onChange(Math.min(field.max, Math.max(field.min, Number(e.target.value) || field.min)))} />
        </div>
      );
    case "switch":
      return (
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={id}>{label}</Label>
          <Switch id={id} checked={Boolean(value)} onCheckedChange={onChange} />
        </div>
      );
    case "select":
      return (
        <div className="grid gap-1.5">
          <Label htmlFor={id}>{label}</Label>
          {/* A native select keeps the inspector light and works with the keyboard. */}
          <select id={id} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
            {field.options.map((o) => (
              <option key={o} value={o}>
                {t(`opt_${field.key}_${o}` as "opt_align_center")}
              </option>
            ))}
          </select>
        </div>
      );
    case "image":
      return <ImageField id={id} label={label} value={String(value ?? "")} onChange={onChange} />;
    case "items": {
      const items = Array.isArray(value) ? (value as Values[]) : [];
      const set = (next: Values[]) => onChange(next);
      return (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">{label}</legend>
          {items.map((item, i) => (
            <div key={i} className="grid gap-3 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={t("moveUp")} disabled={i === 0} onClick={() => set(items.map((x, j) => (j === i - 1 ? items[i]! : j === i ? items[i - 1]! : x)))}>
                    <ArrowUpIcon />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={t("moveDown")} disabled={i === items.length - 1} onClick={() => set(items.map((x, j) => (j === i + 1 ? items[i]! : j === i ? items[i + 1]! : x)))}>
                    <ArrowDownIcon />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={t("removeItem")} disabled={items.length === 1} onClick={() => set(items.filter((_, j) => j !== i))}>
                    <Trash2Icon />
                  </Button>
                </span>
              </div>
              {field.fields.map((sub) => (
                <FieldInput key={sub.key} field={sub} id={`${id}-${i}-${sub.key}`} value={item[sub.key]} onChange={(v) => set(items.map((x, j) => (j === i ? { ...x, [sub.key]: v } : x)))} />
              ))}
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="w-fit" disabled={items.length >= field.max} onClick={() => set([...items, field.make()])}>
            <PlusIcon />
            {t("addItem")}
          </Button>
        </fieldset>
      );
    }
  }
}

function ImageField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const t = useTranslations("websiteEditor");
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  function upload(file: File) {
    const form = new FormData();
    form.set("image", file);
    startTransition(async () => {
      const r = await uploadSiteImageAction(form);
      if (!r.ok) return void toast.error(r.message);
      onChange(r.url);
    });
  }
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input id={id} value={value} placeholder="https:// …" onChange={(e) => onChange(e.target.value)} />
        <Button type="button" variant="outline" size="icon" aria-label={t("upload")} title={t("upload")} disabled={pending} onClick={() => input.current?.click()}>
          <ImageUpIcon />
        </Button>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- preview of an uploaded or linked image */}
      {value && <img src={value} alt="" className="h-20 w-full rounded-md border object-cover" />}
    </div>
  );
}
