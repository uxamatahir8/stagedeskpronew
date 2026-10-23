"use client";

import { ArrowDownIcon, ArrowUpIcon, EyeIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { Block, PageContent } from "@stagedesk/core";
import { FormField } from "@/components/form-field";
import { Blocks } from "@/components/site/blocks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { savePageAction } from "./actions";

export interface PageMetaValues {
  slugNl: string;
  slugEn: string;
  kind: "standard" | "legal";
  legalKey: "terms" | "privacy" | "cookies" | "dpa" | "imprint" | null;
  acceptance: "none" | "all" | "agencies";
  placement: "none" | "header" | "footer_product" | "footer_company" | "footer_legal";
  position: number;
}

const blockTypes = ["heading", "paragraph", "list", "table", "image", "callout"] as const;
const emptyBlock = (type: (typeof blockTypes)[number]): Block =>
  type === "heading"
    ? { type, level: 2, text: "" }
    : type === "paragraph"
      ? { type, text: "" }
      : type === "list"
        ? { type, ordered: false, items: [""] }
        : type === "table"
          ? { type, header: ["", ""], rows: [["", ""]] }
          : type === "image"
            ? { type, url: "", alt: "" }
            : { type, tone: "info", text: "" };

/** Lines of a textarea as list items or table cells ("|" separates cells). */
const lines = (s: string) => s.split("\n");

export function PageEditor({ pageId, initialMeta, initialContent }: { pageId: string | null; initialMeta: PageMetaValues; initialContent: PageContent }) {
  const t = useTranslations("pageBuilder");
  const router = useRouter();
  const [meta, setMeta] = useState(initialMeta);
  const [content, setContent] = useState(initialContent);
  const [locale, setLocale] = useState<"nl" | "en">("nl");
  const [preview, setPreview] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const current = content[locale];

  const setLocaleContent = (patch: Partial<PageContent["nl"]>) => setContent((c) => ({ ...c, [locale]: { ...c[locale], ...patch } }));
  const setBlocks = (blocks: Block[]) => setLocaleContent({ blocks });
  const updateBlock = (i: number, block: Block) => setBlocks(current.blocks.map((b, j) => (j === i ? block : b)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...current.blocks];
    const [b] = next.splice(i, 1);
    next.splice(i + by, 0, b!);
    setBlocks(next);
  };

  function save(publish: boolean) {
    // Empty list lines and table rows are left over from typing; they're not content.
    const tidy = (blocks: Block[]) =>
      blocks.map((b) =>
        b.type === "list"
          ? { ...b, items: b.items.map((x) => x.trim()).filter(Boolean) }
          : b.type === "table"
            ? { ...b, rows: b.rows.filter((r) => r.some((c) => c.trim())) }
            : b,
      );
    const cleaned = { nl: { ...content.nl, blocks: tidy(content.nl.blocks) }, en: { ...content.en, blocks: tidy(content.en.blocks) } };
    startTransition(async () => {
      const r = await savePageAction({ pageId, meta, content: cleaned, note, publish });
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.message);
      setNote("");
      if (!pageId) router.replace(`/app/pages/${r.pageId}`);
      else router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
      <Card className="lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle>{t("settings")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <FormField id="pg-slug-nl" label={t("slugNl")}>
            <Input id="pg-slug-nl" value={meta.slugNl} onChange={(e) => setMeta({ ...meta, slugNl: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} />
          </FormField>
          <FormField id="pg-slug-en" label={t("slugEn")}>
            <Input id="pg-slug-en" value={meta.slugEn} onChange={(e) => setMeta({ ...meta, slugEn: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} />
          </FormField>
          <FormField id="pg-placement" label={t("placement")}>
            <Select value={meta.placement} onValueChange={(v) => setMeta({ ...meta, placement: v as PageMetaValues["placement"] })}>
              <SelectTrigger id="pg-placement" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["none", "header", "footer_product", "footer_company", "footer_legal"] as const).map((p) => (
                  <SelectItem key={p} value={p}>
                    {t(`placement_${p}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="pg-position" label={t("position")}>
            <Input id="pg-position" inputMode="numeric" value={String(meta.position)} onChange={(e) => setMeta({ ...meta, position: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
          </FormField>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="pg-legal" className="text-sm">
              {t("legalPage")}
            </label>
            <Switch id="pg-legal" checked={meta.kind === "legal"} onCheckedChange={(c) => setMeta({ ...meta, kind: c ? "legal" : "standard" })} />
          </div>
          {meta.kind === "legal" && (
            <>
              <FormField id="pg-legal-key" label={t("legalKey")}>
                <Select value={meta.legalKey ?? "none"} onValueChange={(v) => setMeta({ ...meta, legalKey: v === "none" ? null : (v as PageMetaValues["legalKey"]) })}>
                  <SelectTrigger id="pg-legal-key" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["none", "terms", "privacy", "cookies", "dpa", "imprint"] as const).map((k) => (
                      <SelectItem key={k} value={k}>
                        {t(`legalKey_${k}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField id="pg-acceptance" label={t("acceptance")} hint={t("acceptanceHint")}>
                <Select value={meta.acceptance} onValueChange={(v) => setMeta({ ...meta, acceptance: v as PageMetaValues["acceptance"] })}>
                  <SelectTrigger id="pg-acceptance" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["none", "all", "agencies"] as const).map((a) => (
                      <SelectItem key={a} value={a}>
                        {t(`acceptance_${a}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={locale} onValueChange={(v) => setLocale(v as "nl" | "en")}>
            <TabsList>
              <TabsTrigger value="nl">Nederlands</TabsTrigger>
              <TabsTrigger value="en">English</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={() => setPreview((p) => !p)} aria-pressed={preview}>
            {preview ? <PencilIcon /> : <EyeIcon />}
            {preview ? t("edit") : t("preview")}
          </Button>
        </div>

        {preview ? (
          <Card>
            <CardContent className="grid gap-6 py-4">
              <h1 className="text-3xl font-bold tracking-tight">{current.title || t("untitled")}</h1>
              <Blocks blocks={current.blocks.filter(isFilled)} />
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="grid gap-4">
                <FormField id={`pg-title-${locale}`} label={t("pageTitle")}>
                  <Input id={`pg-title-${locale}`} value={current.title} maxLength={160} onChange={(e) => setLocaleContent({ title: e.target.value })} />
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField id={`pg-seo-title-${locale}`} label={t("seoTitle")} hint={t("chars", { count: current.seoTitle.length, max: 70 })}>
                    <Input id={`pg-seo-title-${locale}`} value={current.seoTitle} maxLength={70} onChange={(e) => setLocaleContent({ seoTitle: e.target.value })} />
                  </FormField>
                  <FormField id={`pg-seo-desc-${locale}`} label={t("seoDescription")} hint={t("chars", { count: current.seoDescription.length, max: 170 })}>
                    <Input id={`pg-seo-desc-${locale}`} value={current.seoDescription} maxLength={170} onChange={(e) => setLocaleContent({ seoDescription: e.target.value })} />
                  </FormField>
                </div>
              </CardContent>
            </Card>

            {current.blocks.map((block, i) => (
              <Card key={`${locale}-${i}`} className="gap-3 py-4">
                <CardHeader className="flex flex-row items-center justify-between gap-2 px-4">
                  <CardDescription className="font-medium text-foreground">{t(`block_${block.type}`)}</CardDescription>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label={t("moveUp")} disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUpIcon />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={t("moveDown")} disabled={i === current.blocks.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDownIcon />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={t("removeBlock")} onClick={() => setBlocks(current.blocks.filter((_, j) => j !== i))}>
                      <Trash2Icon />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="px-4">
                  <BlockFields block={block} id={`${locale}-${i}`} onChange={(b) => updateBlock(i, b)} />
                </CardContent>
              </Card>
            ))}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-fit">
                  <PlusIcon />
                  {t("addBlock")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {blockTypes.map((type) => (
                  <DropdownMenuItem key={type} onSelect={() => setBlocks([...current.blocks, emptyBlock(type)])}>
                    {t(`block_${type}`)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}

        <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-end gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur">
          <FormField id="pg-note" label={t("note")} className="min-w-48 flex-1">
            <Input id="pg-note" value={note} maxLength={191} placeholder={t("notePlaceholder")} onChange={(e) => setNote(e.target.value)} />
          </FormField>
          <Button variant="outline" disabled={pending} onClick={() => save(false)}>
            {t("saveDraft")}
          </Button>
          <Button disabled={pending} onClick={() => save(true)}>
            {t("saveAndPublish")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Empty blocks are hidden from the preview (they can't be published anyway). */
function isFilled(b: Block) {
  if (b.type === "list") return b.items.some((i) => i.trim());
  if (b.type === "table") return b.header.some((h) => h.trim());
  if (b.type === "image") return Boolean(b.url.trim());
  return Boolean(b.text.trim());
}

function BlockFields({ block, id, onChange }: { block: Block; id: string; onChange: (b: Block) => void }) {
  const t = useTranslations("pageBuilder");
  switch (block.type) {
    case "heading":
      return (
        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <FormField id={`${id}-level`} label={t("level")}>
            <Select value={String(block.level)} onValueChange={(v) => onChange({ ...block, level: v === "3" ? 3 : 2 })}>
              <SelectTrigger id={`${id}-level`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">{t("level2")}</SelectItem>
                <SelectItem value="3">{t("level3")}</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField id={`${id}-text`} label={t("text")}>
            <Input id={`${id}-text`} value={block.text} maxLength={200} onChange={(e) => onChange({ ...block, text: e.target.value })} />
          </FormField>
        </div>
      );
    case "paragraph":
      return (
        <FormField id={`${id}-text`} label={t("text")} hint={t("inlineHint")}>
          <Textarea id={`${id}-text`} rows={4} value={block.text} maxLength={5000} onChange={(e) => onChange({ ...block, text: e.target.value })} />
        </FormField>
      );
    case "list":
      return (
        <div className="grid gap-3">
          <div className="flex items-center gap-2">
            <Switch id={`${id}-ordered`} checked={block.ordered} onCheckedChange={(c) => onChange({ ...block, ordered: c })} />
            <label htmlFor={`${id}-ordered`} className="text-sm">
              {t("numbered")}
            </label>
          </div>
          <FormField id={`${id}-items`} label={t("items")} hint={t("itemsHint")}>
            <Textarea id={`${id}-items`} rows={4} value={block.items.join("\n")} onChange={(e) => onChange({ ...block, items: lines(e.target.value) })} />
          </FormField>
        </div>
      );
    case "table":
      return (
        <div className="grid gap-3">
          <FormField id={`${id}-header`} label={t("tableHeader")} hint={t("cellsHint")}>
            <Input id={`${id}-header`} value={block.header.join(" | ")} onChange={(e) => onChange({ ...block, header: e.target.value.split("|").map((c) => c.trim()) })} />
          </FormField>
          <FormField id={`${id}-rows`} label={t("tableRows")} hint={t("rowsHint")}>
            <Textarea
              id={`${id}-rows`}
              rows={4}
              className="font-mono text-sm"
              value={block.rows.map((r) => r.join(" | ")).join("\n")}
              onChange={(e) => onChange({ ...block, rows: lines(e.target.value).map((l) => l.split("|").map((c) => c.trim())) })}
            />
          </FormField>
        </div>
      );
    case "image":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField id={`${id}-url`} label={t("imageUrl")} hint={t("imageUrlHint")}>
            <Input id={`${id}-url`} value={block.url} onChange={(e) => onChange({ ...block, url: e.target.value })} />
          </FormField>
          <FormField id={`${id}-alt`} label={t("imageAlt")}>
            <Input id={`${id}-alt`} value={block.alt} maxLength={300} onChange={(e) => onChange({ ...block, alt: e.target.value })} />
          </FormField>
          <FormField id={`${id}-caption`} label={t("imageCaption")} className="sm:col-span-2">
            <Input id={`${id}-caption`} value={block.caption ?? ""} maxLength={300} onChange={(e) => onChange({ ...block, caption: e.target.value || undefined })} />
          </FormField>
        </div>
      );
    case "callout":
      return (
        <div className="grid gap-3">
          <div className="flex gap-2">
            {(["info", "warning"] as const).map((tone) => (
              <Button key={tone} type="button" size="sm" variant={block.tone === tone ? "default" : "outline"} className={cn(block.tone !== tone && "text-muted-foreground")} onClick={() => onChange({ ...block, tone })}>
                {t(`tone_${tone}`)}
              </Button>
            ))}
          </div>
          <FormField id={`${id}-text`} label={t("text")} hint={t("inlineHint")}>
            <Textarea id={`${id}-text`} rows={3} value={block.text} maxLength={2000} onChange={(e) => onChange({ ...block, text: e.target.value })} />
          </FormField>
        </div>
      );
  }
}
