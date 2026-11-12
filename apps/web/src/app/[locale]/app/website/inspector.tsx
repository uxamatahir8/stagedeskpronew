"use client";

import { ArrowDownIcon, ArrowUpIcon, CopyIcon, ImageUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { ctaTargets, type Section, sectionBackgrounds, sectionSpacings } from "@stagedesk/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { uploadSiteImageAction } from "./actions";
import { IconPicker } from "./icon-picker";

/**
 * What each section type lets the agency change. One list per type drives the
 * form, so a new section type only needs its fields described here.
 */
type Values = Record<string, unknown>;
type Field = { key: string; when?: (values: Values) => boolean } & (
  | { kind: "text" | "textarea" | "url" | "image" | "icon"; rows?: number }
  | { kind: "number"; min: number; max: number }
  | { kind: "switch" }
  | { kind: "select"; options: readonly string[]; optional?: boolean }
  | { kind: "items"; fields: Field[]; max: number; min?: number; make: () => Values }
);

const cta: Field[] = [
  { key: "ctaLabel", kind: "text" },
  { key: "ctaTarget", kind: "select", options: ctaTargets },
  { key: "ctaUrl", kind: "url", when: (v) => v["ctaTarget"] === "url" },
];
const heading: Field = { key: "heading", kind: "text" };
const intro: Field = { key: "intro", kind: "textarea", rows: 2 };

/** Every section's look: shown under "Style", after its content. */
const style: Field[] = [
  { key: "background", kind: "select", options: sectionBackgrounds },
  { key: "backgroundImage", kind: "image", when: (v) => v["background"] === "image" },
  { key: "spacing", kind: "select", options: sectionSpacings, optional: true },
  { key: "headingAlign", kind: "select", options: ["center", "left"], optional: true },
];

const fields: Record<Section["type"], Field[]> = {
  hero: [{ key: "title", kind: "text" }, { key: "subtitle", kind: "textarea", rows: 3 }, { key: "image", kind: "image" }, { key: "align", kind: "select", options: ["center", "left"] }, ...cta],
  text: [heading, { key: "body", kind: "textarea", rows: 10 }],
  highlights: [
    heading,
    { key: "items", kind: "items", max: 6, make: () => ({ icon: "star", title: "…", body: "" }), fields: [{ key: "icon", kind: "icon" }, { key: "title", kind: "text" }, { key: "body", kind: "textarea", rows: 2 }] },
  ],
  cards: [
    heading,
    intro,
    { key: "layout", kind: "select", options: ["grid", "list", "overlay", "centered"] },
    { key: "columns", kind: "number", min: 2, max: 4, when: (v) => v["layout"] !== "list" },
    {
      key: "items",
      kind: "items",
      max: 12,
      make: () => ({ icon: "star", image: "", title: "…", body: "", linkLabel: "", linkUrl: "" }),
      fields: [
        { key: "icon", kind: "icon" },
        { key: "image", kind: "image" },
        { key: "title", kind: "text" },
        { key: "body", kind: "textarea", rows: 3 },
        { key: "linkLabel", kind: "text" },
        { key: "linkUrl", kind: "url" },
      ],
    },
  ],
  stats: [heading, { key: "items", kind: "items", max: 6, make: () => ({ value: "100+", label: "…", icon: "" }), fields: [{ key: "value", kind: "text" }, { key: "label", kind: "text" }, { key: "icon", kind: "icon" }] }],
  steps: [
    heading,
    intro,
    { key: "layout", kind: "select", options: ["horizontal", "vertical"] },
    { key: "items", kind: "items", max: 8, make: () => ({ title: "…", body: "", icon: "" }), fields: [{ key: "title", kind: "text" }, { key: "body", kind: "textarea", rows: 2 }, { key: "icon", kind: "icon" }] },
  ],
  split: [
    heading,
    { key: "body", kind: "textarea", rows: 6 },
    { key: "image", kind: "image" },
    { key: "imageSide", kind: "select", options: ["right", "left"] },
    { key: "items", kind: "items", max: 8, min: 0, make: () => ({ text: "…" }), fields: [{ key: "text", kind: "text" }] },
    ...cta,
  ],
  artists: [heading, intro, { key: "max", kind: "number", min: 1, max: 24 }],
  packages: [heading, intro, { key: "showPrices", kind: "switch" }],
  pricing: [
    heading,
    intro,
    {
      key: "items",
      kind: "items",
      max: 4,
      make: () => ({ name: "…", price: "", period: "", description: "", features: "", highlighted: false, badge: "", ctaLabel: "" }),
      fields: [
        { key: "name", kind: "text" },
        { key: "price", kind: "text" },
        { key: "period", kind: "text" },
        { key: "description", kind: "textarea", rows: 2 },
        { key: "features", kind: "textarea", rows: 4 },
        { key: "highlighted", kind: "switch" },
        { key: "badge", kind: "text" },
        { key: "ctaLabel", kind: "text" },
      ],
    },
    { key: "ctaTarget", kind: "select", options: ctaTargets },
    { key: "ctaUrl", kind: "url", when: (v) => v["ctaTarget"] === "url" },
  ],
  reviews: [heading, { key: "max", kind: "number", min: 1, max: 12 }],
  testimonials: [
    heading,
    { key: "layout", kind: "select", options: ["grid", "spotlight"] },
    {
      key: "items",
      kind: "items",
      max: 12,
      make: () => ({ quote: "…", author: "", role: "", image: "", rating: 5 }),
      fields: [{ key: "quote", kind: "textarea", rows: 3 }, { key: "author", kind: "text" }, { key: "role", kind: "text" }, { key: "image", kind: "image" }, { key: "rating", kind: "number", min: 0, max: 5 }],
    },
  ],
  gallery: [heading, { key: "images", kind: "items", max: 24, make: () => ({ url: "/brand/mark.png", alt: "" }), fields: [{ key: "url", kind: "image" }, { key: "alt", kind: "text" }] }],
  video: [heading, { key: "url", kind: "url" }],
  logos: [heading, { key: "grayscale", kind: "switch" }, { key: "images", kind: "items", max: 24, make: () => ({ url: "/brand/mark.png", alt: "" }), fields: [{ key: "url", kind: "image" }, { key: "alt", kind: "text" }] }],
  team: [heading, intro, { key: "items", kind: "items", max: 12, make: () => ({ image: "", name: "…", role: "", bio: "" }), fields: [{ key: "image", kind: "image" }, { key: "name", kind: "text" }, { key: "role", kind: "text" }, { key: "bio", kind: "textarea", rows: 2 }] }],
  faq: [heading, { key: "items", kind: "items", max: 20, make: () => ({ q: "…?", a: "…" }), fields: [{ key: "q", kind: "text" }, { key: "a", kind: "textarea", rows: 3 }] }],
  banner: [{ key: "text", kind: "text" }, { key: "icon", kind: "icon" }, ...cta],
  cta: [heading, { key: "body", kind: "textarea", rows: 2 }, ...cta],
  booking: [heading, intro],
  contact: [heading, intro],
  divider: [{ key: "style", kind: "select", options: ["line", "dots", "wave", "space"] }],
};

/** The select value for "no choice of its own"; the select component can't use an empty value. */
const FOLLOW_THEME = "theme";

/** Sections whose content is a single strip: no heading to align, no spacing to choose. */
const compact = new Set<Section["type"]>(["hero", "banner", "divider"]);

export function SectionInspector({ section, onChange }: { section: Section; onChange: (next: Section) => void }) {
  const t = useTranslations("websiteEditor");
  const values = section as unknown as Values;
  const shown = (list: Field[]) => list.filter((f) => !f.when || f.when(values));
  const styleFields = style.filter((f) => !compact.has(section.type) || f.key === "background" || f.key === "backgroundImage");
  const set = (key: string, v: unknown) => {
    const next = { ...values, [key]: v };
    // An empty optional style choice means "follow the theme": leave it out.
    if (v === undefined) delete next[key];
    onChange(next as unknown as Section);
  };
  return (
    <div className="grid gap-4">
      <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{t(`section_${section.type}`)}</p>
      {shown(fields[section.type]).map((f) => (
        <FieldInput key={f.key} field={f} id={`${section.id}-${f.key}`} value={values[f.key]} onChange={(v) => set(f.key, v)} />
      ))}
      {section.type === "text" && <p className="text-xs text-muted-foreground">{t("formattingHint")}</p>}
      {section.type === "pricing" && <p className="text-xs text-muted-foreground">{t("featuresHint")}</p>}
      {(section.type === "artists" || section.type === "packages" || section.type === "reviews") && <p className="text-xs text-muted-foreground">{t(`liveHint_${section.type}`)}</p>}
      <div className="grid gap-4 border-t pt-4">
        <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{t("style")}</p>
        {shown(styleFields).map((f) => (
          <FieldInput key={f.key} field={f} id={`${section.id}-${f.key}`} value={values[f.key]} onChange={(v) => set(f.key, v)} />
        ))}
      </div>
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
          <Input id={id} type="text" inputMode={field.kind === "url" ? "url" : undefined} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder={field.kind === "url" ? t("linkPlaceholder") : undefined} />
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
          <NativeSelect id={id} value={String(value ?? (field.optional ? FOLLOW_THEME : ""))} onChange={(e) => onChange(field.optional && e.target.value === FOLLOW_THEME ? undefined : e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
            {field.optional && <option value={FOLLOW_THEME}>{t("followTheme")}</option>}
            {field.options.map((o) => (
              <option key={o} value={o}>
                {t(`opt_${field.key}_${o}` as "opt_align_center")}
              </option>
            ))}
          </NativeSelect>
        </div>
      );
    case "image":
      return <ImageField id={id} label={label} value={String(value ?? "")} onChange={onChange} />;
    case "icon":
      return (
        <div className="grid gap-1.5">
          <Label htmlFor={id}>{label}</Label>
          <IconPicker id={id} value={String(value ?? "")} onChange={onChange} />
        </div>
      );
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
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={t("duplicateItem")} disabled={items.length >= field.max} onClick={() => set([...items.slice(0, i + 1), structuredClone(item), ...items.slice(i + 1)])}>
                    <CopyIcon />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={t("removeItem")} disabled={items.length <= (field.min ?? 1)} onClick={() => set(items.filter((_, j) => j !== i))}>
                    <Trash2Icon />
                  </Button>
                </span>
              </div>
              {field.fields
                .filter((sub) => !sub.when || sub.when(item))
                .map((sub) => (
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
