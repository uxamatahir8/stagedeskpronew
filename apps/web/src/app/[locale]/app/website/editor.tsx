"use client";

import { closestCenter, DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDownIcon, ArrowUpIcon, CopyIcon, ExternalLinkIcon, FilePlusIcon, GripVerticalIcon, MonitorIcon, PlusIcon, RocketIcon, SmartphoneIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { type Section, sectionTypes, siteFonts, type SitePageContent, type SiteTheme } from "@stagedesk/core";
import { SiteFooter, SiteFrame, SiteHeader, type SiteRenderData, SiteSection } from "@/components/sites/site-sections";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { createPageAction, deletePageAction, publishAction, reorderPagesAction, saveDraftAction, saveThemeAction, setLiveAction, updatePageSettingsAction } from "./actions";
import { SectionInspector } from "./inspector";
import { cloneSection, newSection } from "./new-section";
import { NativeSelect } from "@/components/ui/native-select";

export type EditorPage = { id: string; slug: string; inNav: boolean; draft: SitePageContent; changed: boolean };
type Lang = "nl" | "en";
type SaveState = "saved" | "dirty" | "saving" | "error";
type Tab = "section" | "page" | "design";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

/**
 * The website editor: a toolbar to switch pages and add sections, a live
 * preview where sections are dragged into order, and the selected section's
 * settings (or the page and design settings) on the right. Drafts save
 * automatically; nothing reaches the live site until "Publish".
 */
export function SiteEditor({
  initialPages,
  initialTheme,
  initialEnglish,
  data,
  live,
  publishedAt,
  siteUrl,
  branding,
}: {
  initialPages: EditorPage[];
  initialTheme: SiteTheme;
  initialEnglish: boolean;
  data: SiteRenderData;
  live: boolean;
  publishedAt: string | null;
  siteUrl: string;
  branding: boolean;
}) {
  const t = useTranslations("websiteEditor");
  const router = useRouter();
  const [pages, setPages] = useState(initialPages);
  const [pageId, setPageId] = useState(initialPages[0]!.id);
  const [lang, setLang] = useState<Lang>("nl");
  const [selected, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("page");
  const [theme, setTheme] = useState(initialTheme);
  const [english, setEnglish] = useState(initialEnglish);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [unpublished, setUnpublished] = useState(initialPages.some((p) => p.changed) || !publishedAt);
  const [pending, startTransition] = useTransition();
  const dirtyPages = useRef(new Set<string>());
  const themeDirty = useRef(false);
  const pagesRef = useRef(pages);
  const settingsRef = useRef({ theme, english });
  useEffect(() => {
    pagesRef.current = pages;
    settingsRef.current = { theme, english };
  });

  /** Selecting a section shows its settings; clearing goes back to the page settings. */
  const setSelected = (id: string | null) => {
    setSelectedId(id);
    setTab(id ? "section" : "page");
  };

  const page = pages.find((p) => p.id === pageId) ?? pages[0]!;
  const content = page.draft[lang];
  const sections = content?.sections ?? [];
  const selectedSection = sections.find((s) => s.id === selected) ?? null;

  /** Saves everything that changed; resolves false if a save failed. */
  const flush = useCallback(async () => {
    let ok = true;
    for (const id of [...dirtyPages.current]) {
      const p = pagesRef.current.find((x) => x.id === id);
      if (!p) continue;
      dirtyPages.current.delete(id);
      const r = await saveDraftAction(id, p.draft);
      if (!r.ok) {
        ok = false;
        dirtyPages.current.add(id);
        toast.error(r.message);
      }
    }
    if (themeDirty.current) {
      themeDirty.current = false;
      const r = await saveThemeAction({ theme: settingsRef.current.theme, englishEnabled: settingsRef.current.english });
      if (!r.ok) {
        ok = false;
        themeDirty.current = true;
        toast.error(r.message);
      }
    }
    setSaveState(ok ? "saved" : "error");
    return ok;
  }, []);

  // Autosave a moment after the last change.
  useEffect(() => {
    if (saveState !== "dirty") return;
    const timer = setTimeout(() => {
      setSaveState("saving");
      void flush();
    }, 1200);
    return () => clearTimeout(timer);
  }, [saveState, pages, theme, english, flush]);

  // Don't lose edits when leaving the page mid-save.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirtyPages.current.size || themeDirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  function changeDraft(next: SitePageContent) {
    setPages((list) => list.map((p) => (p.id === page.id ? { ...p, draft: next } : p)));
    dirtyPages.current.add(page.id);
    setUnpublished(true);
    setSaveState("dirty");
  }
  function setSections(next: Section[]) {
    if (!content) return;
    changeDraft({ ...page.draft, [lang]: { ...content, sections: next } });
  }
  function changeTheme(next: Partial<SiteTheme>, englishNext = english) {
    setTheme((th) => ({ ...th, ...next }));
    setEnglish(englishNext);
    themeDirty.current = true;
    setUnpublished(true);
    setSaveState("dirty");
  }

  function addSection(type: Section["type"]) {
    const section = newSection(type, lang);
    const at = selected ? sections.findIndex((s) => s.id === selected) + 1 : sections.length;
    setSections([...sections.slice(0, at), section, ...sections.slice(at)]);
    setSelected(section.id);
  }
  function moveSection(id: string, by: -1 | 1) {
    const i = sections.findIndex((s) => s.id === id);
    if (i + by < 0 || i + by >= sections.length) return;
    setSections(arrayMove(sections, i, i + by));
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = sections.findIndex((s) => s.id === e.active.id);
    const to = sections.findIndex((s) => s.id === e.over!.id);
    setSections(arrayMove(sections, from, to));
  }

  /** Page list changes (new, delete, rename, order) save pending edits first and reload server data. */
  const pageAction = (task: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      if (!(await flush())) return;
      const r = await task();
      if (!r.ok) return void toast.error(r.message);
      after?.();
      router.refresh();
    });

  function publish() {
    startTransition(async () => {
      if (!(await flush())) return;
      const r = await publishAction();
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.message);
      setUnpublished(false);
      router.refresh();
    });
  }

  function movePage(by: -1 | 1) {
    const rest = pages.filter((p) => p.slug !== "");
    const i = rest.findIndex((p) => p.id === page.id);
    if (i < 0 || i + by < 0 || i + by >= rest.length) return;
    const order = arrayMove(rest, i, i + by);
    setPages([...pages.filter((p) => p.slug === ""), ...order]);
    pageAction(() => reorderPagesAction(order.map((p) => p.id)));
  }

  const nav = pages.filter((p) => p.inNav).map((p) => ({ href: "#", label: (p.draft[lang] ?? p.draft.nl).title, current: p.id === page.id }));
  const home = pages.find((p) => p.slug === "");
  const bookingId = (home?.draft[lang] ?? home?.draft.nl)?.sections.find((s) => s.type === "booking")?.id;
  const otherPages = pages.filter((p) => p.slug !== "");
  const position = otherPages.findIndex((p) => p.id === page.id);

  return (
    <div className="grid gap-4">
      {/* Toolbar: page, language, size, saving and publishing */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
        <label htmlFor="ed-page" className="sr-only">
          {t("pages")}
        </label>
        <NativeSelect
          id="ed-page"
          value={page.id}
          onChange={(e) => {
            setPageId(e.target.value);
            setSelected(null);
          }}
          className="h-9 max-w-56 rounded-md border bg-background px-3 text-sm font-medium"
        >
          {pages.map((p) => (
            <option key={p.id} value={p.id}>
              {(p.draft[lang] ?? p.draft.nl).title}
              {p.slug ? ` (/${p.slug})` : ""}
            </option>
          ))}
        </NativeSelect>
        <NewPageDialog
          onCreate={(input) =>
            pageAction(async () => {
              const r = await createPageAction(input);
              if (r.ok) toast.success(r.message);
              return r;
            })
          }
          pending={pending}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={!content}>
              <PlusIcon />
              {t("addSection")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {sectionTypes.map((type) => (
              <DropdownMenuItem key={type} onSelect={() => addSection(type)}>
                {t(`section_${type}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1" role="group" aria-label={t("language")}>
          {(["nl", "en"] as const).map((l) => (
            <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l} className={cn("rounded-md px-2.5 py-1 text-sm", lang === l ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1" role="group" aria-label={t("device")}>
          <button type="button" onClick={() => setDevice("desktop")} aria-pressed={device === "desktop"} aria-label={t("desktop")} className={cn("rounded-md p-1.5", device === "desktop" ? "bg-background shadow-sm" : "text-muted-foreground")}>
            <MonitorIcon className="size-4" />
          </button>
          <button type="button" onClick={() => setDevice("mobile")} aria-pressed={device === "mobile"} aria-label={t("mobile")} className={cn("rounded-md p-1.5", device === "mobile" ? "bg-background shadow-sm" : "text-muted-foreground")}>
            <SmartphoneIcon className="size-4" />
          </button>
        </div>
        <span className="text-sm text-muted-foreground" role="status">
          {t(`save_${saveState}`)}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {publishedAt && <Pill tone={live ? "success" : "neutral"}>{t(live ? "isLive" : "isOffline")}</Pill>}
          {publishedAt && (
            <Button asChild variant="ghost" size="sm">
              <a href={siteUrl} target="_blank" rel="noopener">
                <ExternalLinkIcon />
                {t("viewSite")}
              </a>
            </Button>
          )}
          {publishedAt && (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await setLiveAction(!live);
                  if (!r.ok) return void toast.error(r.message);
                  toast.success(r.message);
                  router.refresh();
                })
              }
            >
              {t(live ? "takeOffline" : "putOnline")}
            </Button>
          )}
          <Button disabled={pending || (!unpublished && live)} onClick={publish}>
            <RocketIcon />
            {unpublished ? t("publish") : t("published")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_19rem]">
        {/* Live preview */}
        <div className="min-w-0 overflow-hidden rounded-xl border bg-muted/40 p-3">
          {!content ? (
            <div className="grid min-h-80 place-items-center gap-3 p-8 text-center">
              <p className="max-w-sm text-sm text-muted-foreground">{t("noEnglish")}</p>
              <Button onClick={() => changeDraft({ ...page.draft, en: structuredClone(page.draft.nl) })}>{t("copyFromDutch")}</Button>
            </div>
          ) : (
            <div data-testid="site-preview" className={cn("mx-auto overflow-hidden rounded-lg border bg-white shadow-sm transition-[max-width]", device === "mobile" ? "max-w-[390px]" : "max-w-none")}>
              <SiteFrame theme={theme}>
                {/* Clicks in the preview select sections; links don't navigate. */}
                <div onClickCapture={(e) => (e.target as HTMLElement).closest("a") && e.preventDefault()}>
                  <SiteHeader data={data} theme={theme} nav={nav} ctaHref={bookingId ? `#${bookingId}` : "#"} langSwitch={null} />
                  {/* A fixed id keeps dnd-kit's generated ids the same on the server and in the browser. */}
                  <DndContext id="site-editor" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                    <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                      {sections.map((section, i) => (
                        <SortableSection
                          key={section.id}
                          section={section}
                          selected={section.id === selected}
                          first={i === 0}
                          last={i === sections.length - 1}
                          onSelect={() => setSelected(section.id)}
                          onMove={(by) => moveSection(section.id, by)}
                          onDuplicate={() => {
                            const copy = cloneSection(section);
                            setSections([...sections.slice(0, i + 1), copy, ...sections.slice(i + 1)]);
                            setSelected(copy.id);
                          }}
                          onDelete={() => {
                            setSections(sections.filter((s) => s.id !== section.id));
                            setSelected(null);
                          }}
                        >
                          <SiteSection section={section} data={data} preview ctaHref={bookingId ? `#${bookingId}` : "#"} contactHref="#" />
                        </SortableSection>
                      ))}
                    </SortableContext>
                  </DndContext>
                  {sections.length === 0 && <p className="p-16 text-center text-sm text-neutral-500">{t("emptyPage")}</p>}
                  <SiteFooter data={data} branding={branding} />
                </div>
              </SiteFrame>
            </div>
          )}
        </div>

        {/* Settings */}
        <aside className="grid content-start gap-4 lg:sticky lg:top-20 lg:max-h-[calc(100svh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          <Tabs value={tab === "section" && !selectedSection ? "page" : tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList className="w-full">
              <TabsTrigger value="section" disabled={!selectedSection} className="flex-1">
                {t("tabSection")}
              </TabsTrigger>
              <TabsTrigger value="page" className="flex-1">
                {t("tabPage")}
              </TabsTrigger>
              <TabsTrigger value="design" className="flex-1">
                {t("tabDesign")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="section" className="mt-3 rounded-xl border bg-card p-4">
              {selectedSection && <SectionInspector section={selectedSection} onChange={(next) => setSections(sections.map((s) => (s.id === next.id ? next : s)))} />}
            </TabsContent>
            <TabsContent value="page" className="mt-3 grid gap-4 rounded-xl border bg-card p-4">
              {content ? (
                <>
                  <div className="grid gap-1.5">
                    <Label htmlFor="pg-title">{t("pageTitle")}</Label>
                    <Input id="pg-title" value={content.title} onChange={(e) => changeDraft({ ...page.draft, [lang]: { ...content, title: e.target.value } })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="pg-seo-title">{t("seoTitle")}</Label>
                    <Input id="pg-seo-title" maxLength={70} value={content.seoTitle} onChange={(e) => changeDraft({ ...page.draft, [lang]: { ...content, seoTitle: e.target.value } })} />
                    <p className="text-xs text-muted-foreground">{t("seoTitleHint", { count: content.seoTitle.length })}</p>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="pg-seo-desc">{t("seoDescription")}</Label>
                    <Textarea id="pg-seo-desc" rows={3} maxLength={170} value={content.seoDescription} onChange={(e) => changeDraft({ ...page.draft, [lang]: { ...content, seoDescription: e.target.value } })} />
                    <p className="text-xs text-muted-foreground">{t("seoDescriptionHint", { count: content.seoDescription.length })}</p>
                  </div>
                  {lang === "en" && page.draft.en && (
                    <Button variant="outline" size="sm" className="w-fit" onClick={() => changeDraft({ ...page.draft, en: null })}>
                      {t("removeEnglish")}
                    </Button>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t("noEnglish")}</p>
              )}
              <div className="grid gap-3 border-t pt-4">
                {page.slug !== "" && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="pg-slug">{t("pageSlug")}</Label>
                    <Input
                      id="pg-slug"
                      defaultValue={page.slug}
                      key={page.id}
                      onBlur={(e) => {
                        const next = slugify(e.target.value);
                        if (next && next !== page.slug) pageAction(() => updatePageSettingsAction(page.id, { slug: next }));
                      }}
                    />
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="pg-nav">{t("inNav")}</Label>
                  <Switch
                    id="pg-nav"
                    checked={page.inNav}
                    onCheckedChange={(c) => {
                      setPages((list) => list.map((x) => (x.id === page.id ? { ...x, inNav: c } : x)));
                      pageAction(() => updatePageSettingsAction(page.id, { inNav: c }));
                    }}
                  />
                </div>
                {page.slug !== "" && (
                  <div className="flex flex-wrap items-center gap-1">
                    <Button variant="ghost" size="sm" disabled={pending || position <= 0} onClick={() => movePage(-1)}>
                      <ArrowUpIcon />
                      {t("moveUp")}
                    </Button>
                    <Button variant="ghost" size="sm" disabled={pending || position >= otherPages.length - 1} onClick={() => movePage(1)}>
                      <ArrowDownIcon />
                      {t("moveDown")}
                    </Button>
                    <Button variant="ghost" size="sm" className="ml-auto text-destructive" disabled={pending} onClick={() => pageAction(() => deletePageAction(page.id), () => setPageId(pages[0]!.id))}>
                      <Trash2Icon />
                      {t("deletePage")}
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="design" className="mt-3 grid gap-4 rounded-xl border bg-card p-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="th-primary">{t("primary")}</Label>
                  <input id="th-primary" type="color" value={theme.primary} onChange={(e) => changeTheme({ primary: e.target.value })} className="h-9 w-full cursor-pointer rounded-md border bg-background" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="th-accent">{t("accent")}</Label>
                  <input id="th-accent" type="color" value={theme.accent} onChange={(e) => changeTheme({ accent: e.target.value })} className="h-9 w-full cursor-pointer rounded-md border bg-background" />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="th-font">{t("font")}</Label>
                <NativeSelect id="th-font" value={theme.font} onChange={(e) => changeTheme({ font: e.target.value as SiteTheme["font"] })} className="h-9 rounded-md border bg-background px-3 text-sm">
                  {siteFonts.map((f) => (
                    <option key={f} value={f}>
                      {t(`font_${f}`)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="th-radius">{t("corners")}</Label>
                <NativeSelect id="th-radius" value={theme.radius} onChange={(e) => changeTheme({ radius: e.target.value as SiteTheme["radius"] })} className="h-9 rounded-md border bg-background px-3 text-sm">
                  {(["sharp", "soft", "round"] as const).map((r) => (
                    <option key={r} value={r}>
                      {t(`radius_${r}`)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="th-mode">{t("header")}</Label>
                <NativeSelect id="th-mode" value={theme.mode} onChange={(e) => changeTheme({ mode: e.target.value as SiteTheme["mode"] })} className="h-9 rounded-md border bg-background px-3 text-sm">
                  <option value="light">{t("mode_light")}</option>
                  <option value="dark">{t("mode_dark")}</option>
                </NativeSelect>
              </div>
              <div className="flex items-center justify-between gap-3 border-t pt-4">
                <Label htmlFor="th-english" className="grid gap-0.5">
                  <span>{t("englishSite")}</span>
                  <span className="text-xs font-normal text-muted-foreground">{t("englishSiteHint")}</span>
                </Label>
                <Switch id="th-english" checked={english} onCheckedChange={(c) => changeTheme({}, c)} />
              </div>
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}

function NewPageDialog({ onCreate, pending }: { onCreate: (input: { slug: string; title: string }) => void; pending: boolean }) {
  const t = useTranslations("websiteEditor");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FilePlusIcon />
          {t("newPage")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("newPage")}</DialogTitle>
          <DialogDescription>{t("newPageHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="np-title">{t("pageTitle")}</Label>
            <Input
              id="np-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setSlug(slugify(e.target.value));
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="np-slug">{t("pageSlug")}</Label>
            <Input id="np-slug" value={slug} onChange={(e) => setSlug(slugify(e.target.value))} />
            <p className="text-xs text-muted-foreground">/{slug}</p>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("cancel")}</Button>
          </DialogClose>
          <Button
            disabled={pending || !slug}
            onClick={() => {
              onCreate({ slug, title });
              setOpen(false);
              setTitle("");
              setSlug("");
            }}
          >
            {t("createPage")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SortableSection({
  section,
  selected,
  first,
  last,
  onSelect,
  onMove,
  onDuplicate,
  onDelete,
  children,
}: {
  section: Section;
  selected: boolean;
  first: boolean;
  last: boolean;
  onSelect: () => void;
  onMove: (by: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("websiteEditor");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-section={section.type}
      className={cn("group relative cursor-pointer outline-offset-[-3px]", selected ? "outline-3 outline-[#7c3aed]" : "hover:outline-2 hover:outline-[#7c3aed]/50", isDragging && "z-10 opacity-80 shadow-2xl")}
      onClick={onSelect}
    >
      {children}
      <div className={cn("absolute top-2 right-2 z-20 items-center gap-0.5 rounded-lg border bg-white p-0.5 text-neutral-800 shadow-md", selected ? "flex" : "hidden group-hover:flex")}>
        <span className="px-2 text-xs font-medium">{t(`section_${section.type}`)}</span>
        <button type="button" className="cursor-grab rounded p-1 hover:bg-neutral-100 active:cursor-grabbing" aria-label={t("drag")} {...attributes} {...listeners}>
          <GripVerticalIcon className="size-4" />
        </button>
        <button type="button" className="rounded p-1 hover:bg-neutral-100 disabled:opacity-30" aria-label={t("moveUp")} disabled={first} onClick={stop(() => onMove(-1))}>
          <ArrowUpIcon className="size-4" />
        </button>
        <button type="button" className="rounded p-1 hover:bg-neutral-100 disabled:opacity-30" aria-label={t("moveDown")} disabled={last} onClick={stop(() => onMove(1))}>
          <ArrowDownIcon className="size-4" />
        </button>
        <button type="button" className="rounded p-1 hover:bg-neutral-100" aria-label={t("duplicate")} onClick={stop(onDuplicate)}>
          <CopyIcon className="size-4" />
        </button>
        <button type="button" className="rounded p-1 text-red-600 hover:bg-red-50" aria-label={t("deleteSection")} onClick={stop(onDelete)}>
          <Trash2Icon className="size-4" />
        </button>
      </div>
    </div>
  );
}
