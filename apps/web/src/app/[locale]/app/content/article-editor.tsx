"use client";

import { BoldIcon, EyeIcon, Heading2Icon, Heading3Icon, ImageIcon, ImageUpIcon, LinkIcon, ListIcon, ListOrderedIcon, QuoteIcon, Trash2Icon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { type ContentKind, readingMinutes, localePrefix } from "@stagedesk/core";
import { Markdown } from "@/components/content/markdown";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { deleteArticleAction, saveArticleAction, uploadContentImageAction } from "./actions";
import type { ArticleValues, LocaleText } from "./article-values";


const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);

type Tool = "h2" | "h3" | "bold" | "list" | "numbered" | "quote" | "link" | "image";

/** A Date as the value of a datetime-local input. */
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The English version counts once it has a title or a body. */
const hasText = (x: LocaleText) => Boolean(x.title.trim() || x.body.trim());

export function ArticleEditor({
  kind,
  id,
  initial,
  categories,
  siteUrl,
}: {
  kind: ContentKind;
  id: string | null;
  initial: ArticleValues;
  categories: { id: string; name: string }[];
  siteUrl: string;
}) {
  const t = useTranslations("contentAdmin");
  const router = useRouter();
  // The date input works in local time; the server may render it in another zone, so it's fixed up on hydration.
  const [v, setV] = useState(() => ({ ...initial, publishedAt: initial.publishedAt ? toLocalInput(new Date(initial.publishedAt)) : "" }));
  const [lang, setLang] = useState<"nl" | "en">("nl");
  const [view, setView] = useState<"write" | "preview" | "split">("split");
  const [slugTouched, setSlugTouched] = useState(Boolean(id));
  const [pending, start] = useTransition();
  const [uploading, startUpload] = useTransition();
  const body = useRef<HTMLTextAreaElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const inlineInput = useRef<HTMLInputElement>(null);
  const text = v[lang];

  const setText = (patch: Partial<LocaleText>) =>
    setV((prev) => {
      const next = { ...prev, [lang]: { ...prev[lang], ...patch } };
      if (lang === "nl" && patch.title !== undefined && !slugTouched) next.slug = slugify(patch.title);
      return next;
    });

  /** Wraps the selection in the body (or inserts at the cursor) and keeps focus. */
  function format(before: string, after = "", placeholder = "") {
    const el = body.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    const selected = value.slice(s, e) || placeholder;
    const next = value.slice(0, s) + before + selected + after + value.slice(e);
    setText({ body: next });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + selected.length);
    });
  }
  /** Starts the current line(s) with a prefix, e.g. "## " or "- ". */
  function linePrefix(prefix: string) {
    const el = body.current;
    if (!el) return;
    const { selectionStart: s, value } = el;
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    setText({ body: value.slice(0, lineStart) + prefix + value.slice(lineStart) });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + prefix.length, s + prefix.length);
    });
  }

  function runTool(tool: Tool) {
    if (tool === "h2") linePrefix("## ");
    else if (tool === "h3") linePrefix("### ");
    else if (tool === "bold") format("**", "**", t("toolBoldPlaceholder"));
    else if (tool === "list") linePrefix("- ");
    else if (tool === "numbered") linePrefix("1. ");
    else if (tool === "quote") linePrefix("> ");
    else if (tool === "link") format("[", "](https://)", t("toolLinkPlaceholder"));
    else inlineInput.current?.click();
  }

  function upload(file: File, done: (url: string) => void) {
    const form = new FormData();
    form.set("image", file);
    startUpload(async () => {
      const r = await uploadContentImageAction(form);
      if (!r.ok) return void toast.error(r.message);
      done(r.url);
    });
  }

  function save(publish: boolean | null) {
    const status = publish === null ? v.status : publish ? "published" : "draft";
    start(async () => {
      const r = await saveArticleAction(kind, id, {
        slug: v.slug,
        categoryId: v.categoryId || null,
        status,
        featured: v.featured,
        publishedAt: v.publishedAt ? new Date(v.publishedAt).toISOString() : null,
        coverImage: v.coverImage,
        authorName: v.authorName,
        position: v.position,
        nl: v.nl,
        en: hasText(v.en) ? v.en : null,
      });
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.message);
      setV((prev) => ({ ...prev, status }));
      if (!id) router.replace(`/app/content/${r.id}`);
      else router.refresh();
    });
  }

  const seoTitle = text.seoTitle || text.title;
  const seoDescription = text.seoDescription || text.excerpt;
  const path = kind === "changelog" ? "/changelog" : `/${kind}/${v.slug}`;
  const tools: { icon: typeof BoldIcon; label: string; run: Tool }[] = [
    { icon: Heading2Icon, label: t("toolH2"), run: "h2" },
    { icon: Heading3Icon, label: t("toolH3"), run: "h3" },
    { icon: BoldIcon, label: t("toolBold"), run: "bold" },
    { icon: ListIcon, label: t("toolList"), run: "list" },
    { icon: ListOrderedIcon, label: t("toolNumbered"), run: "numbered" },
    { icon: QuoteIcon, label: t("toolQuote"), run: "quote" },
    { icon: LinkIcon, label: t("toolLink"), run: "link" },
    { icon: ImageIcon, label: t("toolImage"), run: "image" },
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid min-w-0 content-start gap-6">
        <Card>
          <CardContent className="grid gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm" role="tablist" aria-label={t("language")}>
                {(["nl", "en"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="tab"
                    aria-selected={lang === l}
                    onClick={() => setLang(l)}
                    className={cn("rounded-md px-3 py-1.5", lang === l ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
                  >
                    {t(`lang_${l}`)}
                    {l === "en" && !hasText(v.en) && <span className="ml-1.5 text-xs text-muted-foreground">{t("optional")}</span>}
                  </button>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">{t("minutes", { count: readingMinutes(text.body || " ") })}</p>
            </div>
            {lang === "en" && !hasText(v.en) && <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">{t("englishHint")}</p>}

            <FormField required id="title" label={t("fieldTitle")}>
              <Input required id="title" value={text.title} maxLength={160} onChange={(e) => setText({ title: e.target.value })} className="h-11 text-lg font-semibold" />
            </FormField>
            <FormField id="excerpt" label={t("fieldExcerpt")} hint={t("excerptHint", { count: text.excerpt.length })}>
              <Textarea id="excerpt" rows={2} maxLength={400} value={text.excerpt} onChange={(e) => setText({ excerpt: e.target.value })} />
            </FormField>

            <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="body">{t("fieldBody")}</Label>
                <div className="flex gap-1 rounded-lg bg-muted p-1 text-xs">
                  {(["write", "split", "preview"] as const).map((x) => (
                    <button key={x} type="button" onClick={() => setView(x)} aria-pressed={view === x} className={cn("rounded-md px-2.5 py-1", view === x ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}>
                      {t(`view_${x}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-0.5 rounded-t-lg border border-b-0 bg-muted/40 p-1">
                {tools.map((tool) => (
                  <Button key={tool.label} type="button" variant="ghost" size="icon" className="size-8" aria-label={tool.label} title={tool.label} onClick={() => runTool(tool.run)} disabled={view === "preview"}>
                    <tool.icon />
                  </Button>
                ))}
                <input
                  ref={inlineInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) upload(file, (url) => format(`![`, `](${url})`, t("toolImageAlt")));
                  }}
                />
              </div>
              <div className={cn("-mt-2 grid rounded-b-lg border", view === "split" && "lg:grid-cols-2")}>
                {view !== "preview" && (
                  <Textarea
                    id="body"
                    ref={body}
                    value={text.body}
                    onChange={(e) => setText({ body: e.target.value })}
                    rows={24}
                    maxLength={60000}
                    spellCheck
                    className="min-h-[32rem] resize-y rounded-none border-0 font-mono text-sm leading-6 shadow-none focus-visible:ring-0"
                    placeholder={t("bodyPlaceholder")}
                  />
                )}
                {view !== "write" && (
                  <div className={cn("max-h-[44rem] min-h-[32rem] overflow-y-auto bg-background p-5", view === "split" && "border-t lg:border-t-0 lg:border-l")} aria-label={t("preview")}>
                    {text.body.trim() ? (
                      <Markdown className="text-base">{text.body}</Markdown>
                    ) : (
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <EyeIcon className="size-4" aria-hidden />
                        {t("previewEmpty")}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t("markdownHint")}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("seo")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="seo-title" label={t("seoTitle")} hint={t("chars", { count: text.seoTitle.length, max: 70 })}>
                <Input id="seo-title" maxLength={70} value={text.seoTitle} placeholder={text.title} onChange={(e) => setText({ seoTitle: e.target.value })} />
              </FormField>
              <FormField id="seo-description" label={t("seoDescription")} hint={t("chars", { count: text.seoDescription.length, max: 170 })}>
                <Textarea id="seo-description" rows={2} maxLength={170} value={text.seoDescription} placeholder={text.excerpt} onChange={(e) => setText({ seoDescription: e.target.value })} />
              </FormField>
            </div>
            {/* How the result may look in Google. */}
            <div className="grid gap-0.5 rounded-lg border bg-background p-4" aria-label={t("searchPreview")}>
              <p className="truncate text-xs text-muted-foreground">
                {siteUrl}
                {localePrefix(lang)}
                {path}
              </p>
              <p className="truncate text-lg text-[#1a0dab] dark:text-[#8ab4f8]">{seoTitle ? `${seoTitle} · StageDesk` : t("fieldTitle")}</p>
              <p className="line-clamp-2 text-sm text-muted-foreground">{seoDescription || t("seoDescriptionMissing")}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <aside className="grid content-start gap-6 xl:sticky xl:top-20 xl:max-h-[calc(100svh-6rem)] xl:self-start xl:overflow-y-auto xl:pr-1">
        <Card>
          <CardHeader>
            <CardTitle>{t("publishing")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <p className="text-sm">
              {t("currentStatus")}: <span className="font-medium">{t(`status_${v.status}`)}</span>
            </p>
            <FormField id="published-at" label={t("publishedAt")} hint={t("publishedAtHint")}>
              <Input id="published-at" type="datetime-local" suppressHydrationWarning value={v.publishedAt} onChange={(e) => setV({ ...v, publishedAt: e.target.value })} />
            </FormField>
            <div className="grid gap-2">
              <Button onClick={() => save(true)} disabled={pending || uploading}>
                {v.status === "published" ? t("update") : t("publish")}
              </Button>
              {v.status === "published" ? (
                <Button variant="outline" onClick={() => save(false)} disabled={pending}>
                  {t("unpublish")}
                </Button>
              ) : (
                <Button variant="outline" onClick={() => save(false)} disabled={pending}>
                  {t("saveDraft")}
                </Button>
              )}
              {id && (
                <Button
                  variant="ghost"
                  className="text-destructive"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(t("deleteConfirm"))) return;
                    start(async () => {
                      const r = await deleteArticleAction(id);
                      if (r.message) toast.success(r.message);
                      router.replace(`/app/content${kind === "blog" ? "" : `?kind=${kind}`}`);
                    });
                  }}
                >
                  <Trash2Icon />
                  {t("delete")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <FormField required id="slug" label={t("slug")} hint={kind === "changelog" ? undefined : `/${kind}/${v.slug || "…"}`}>
              <Input required
                id="slug"
                value={v.slug}
                className="font-mono text-sm"
                onChange={(e) => {
                  setSlugTouched(true);
                  setV({ ...v, slug: e.target.value.toLowerCase() });
                }}
              />
            </FormField>
            {kind !== "changelog" && (
              <FormField id="category" label={t("category")}>
                <select id="category" value={v.categoryId} onChange={(e) => setV({ ...v, categoryId: e.target.value })} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                  <option value="">{t("noCategory")}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </FormField>
            )}
            {kind === "blog" && (
              <>
                <div className="flex items-start justify-between gap-3">
                  <Label htmlFor="featured" className="grid gap-0.5">
                    <span>{t("featured")}</span>
                    <span className="text-xs font-normal text-muted-foreground">{t("featuredFieldHint")}</span>
                  </Label>
                  <Switch id="featured" checked={v.featured} onCheckedChange={(featured) => setV({ ...v, featured })} />
                </div>
                <FormField id="author" label={t("author")}>
                  <Input id="author" maxLength={120} value={v.authorName} onChange={(e) => setV({ ...v, authorName: e.target.value })} />
                </FormField>
              </>
            )}
            {kind === "help" && (
              <FormField id="position" label={t("position")} hint={t("positionHint")}>
                <Input id="position" type="number" min={0} max={9999} value={v.position} onChange={(e) => setV({ ...v, position: Number(e.target.value) || 0 })} />
              </FormField>
            )}
          </CardContent>
        </Card>

        {kind === "blog" && (
          <Card>
            <CardHeader>
              <CardTitle>{t("cover")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {v.coverImage ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- preview of an uploaded or linked image */}
                  <img src={v.coverImage} alt="" className="aspect-[16/9] w-full rounded-md border object-cover" />
                  <Button type="button" variant="secondary" size="icon" className="absolute top-2 right-2 size-7" aria-label={t("removeCover")} onClick={() => setV({ ...v, coverImage: "" })}>
                    <XIcon />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => coverInput.current?.click()}
                  className="grid aspect-[16/9] place-items-center rounded-md border border-dashed text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"
                >
                  <span className="flex flex-col items-center gap-1">
                    <ImageUpIcon className="size-5" aria-hidden />
                    {uploading ? t("uploading") : t("uploadCover")}
                  </span>
                </button>
              )}
              <input
                ref={coverInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) upload(file, (url) => setV((prev) => ({ ...prev, coverImage: url })));
                }}
              />
              <FormField id="cover-url" label={t("coverUrl")} hint={t("coverHint")}>
                <Input id="cover-url" value={v.coverImage} placeholder="https:// …" onChange={(e) => setV({ ...v, coverImage: e.target.value })} />
              </FormField>
            </CardContent>
          </Card>
        )}
      </aside>
    </div>
  );
}
