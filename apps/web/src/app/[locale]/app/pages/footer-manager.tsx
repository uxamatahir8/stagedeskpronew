"use client";

import { ArrowDownIcon, ArrowUpIcon, ExternalLinkIcon, FileTextIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { siteRoutes } from "@/config/site-routes";
import { useRouter } from "@/i18n/navigation";
import {
  deleteFooterColumnAction,
  deleteFooterLinkAction,
  moveFooterItemAction,
  saveFooterColumnAction,
  saveFooterLinkAction,
  saveFooterSettingsAction,
} from "./actions";

export interface FooterLinkRow {
  id: string;
  kind: "route" | "url";
  target: string;
  labelNl: string;
  labelEn: string;
  newTab: boolean;
}
export interface FooterColumnRow {
  id: string;
  titleNl: string;
  titleEn: string;
  links: FooterLinkRow[];
  /** Builder pages placed in this column (managed on the page itself). */
  pages: { id: string; title: string }[];
}
export interface FooterSettings {
  taglineNl: string;
  taglineEn: string;
  email: string;
  phone: string;
  address: string;
  kvkNumber: string;
  vatNumber: string;
  bottomNl: string;
  bottomEn: string;
  socials: Record<"instagram" | "facebook" | "linkedin" | "youtube" | "tiktok" | "x", string>;
}

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (task: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) =>
    start(async () => {
      const r = await task();
      if (r.message) (r.ok ? toast.success : toast.error)(r.message);
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  return [pending, run] as const;
}

type LinkDraft = FooterLinkRow & { columnId: string };
const blankLink = (columnId: string): LinkDraft => ({ id: "", columnId, kind: "route", target: "/", labelNl: "", labelEn: "", newTab: false });

/**
 * The website footer: columns and their links, in order, plus the details
 * next to the logo. Pages from the page builder show up in the column chosen
 * on the page itself.
 */
export function FooterManager({ columns, settings }: { columns: FooterColumnRow[]; settings: FooterSettings }) {
  const t = useTranslations("footerAdmin");
  const locale = useLocale();
  const [pending, run] = useRun();
  const [column, setColumn] = useState<{ id: string | null; titleNl: string; titleEn: string } | null>(null);
  const [link, setLink] = useState<LinkDraft | null>(null);
  const label = (x: { labelNl: string; labelEn: string }) => (locale === "en" ? x.labelEn : x.labelNl);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">{t("intro")}</p>
        <Button onClick={() => setColumn({ id: null, titleNl: "", titleEn: "" })}>
          <PlusIcon />
          {t("addColumn")}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {columns.map((c, ci) => (
          <Card key={c.id} className="gap-3">
            <CardHeader className="flex flex-row items-start justify-between gap-2">
              <div className="grid gap-0.5">
                <CardTitle>{locale === "en" ? c.titleEn : c.titleNl}</CardTitle>
                <CardDescription>{locale === "en" ? c.titleNl : c.titleEn}</CardDescription>
              </div>
              <div className="flex shrink-0">
                <Button variant="ghost" size="icon-sm" aria-label={t("moveLeft")} disabled={pending || ci === 0} onClick={() => run(() => moveFooterItemAction("column", c.id, -1))}>
                  <ArrowUpIcon className="-rotate-90" />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={t("moveRight")} disabled={pending || ci === columns.length - 1} onClick={() => run(() => moveFooterItemAction("column", c.id, 1))}>
                  <ArrowDownIcon className="-rotate-90" />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={t("editColumn")} onClick={() => setColumn({ id: c.id, titleNl: c.titleNl, titleEn: c.titleEn })}>
                  <PencilIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive"
                  aria-label={t("deleteColumn")}
                  disabled={pending}
                  onClick={() => window.confirm(t("deleteColumnConfirm", { name: c.titleNl })) && run(() => deleteFooterColumnAction(c.id))}
                >
                  <Trash2Icon />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3">
              <ul className="grid gap-1">
                {c.links.map((l, li) => (
                  <li key={l.id} className="flex items-center gap-1 rounded-md py-1 pr-1 pl-2 text-sm hover:bg-muted/60">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 truncate font-medium">
                        {label(l)}
                        {l.kind === "url" && <ExternalLinkIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />}
                      </span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">{l.target}</span>
                    </span>
                    <Button variant="ghost" size="icon" className="size-7" aria-label={t("moveUp")} disabled={pending || li === 0} onClick={() => run(() => moveFooterItemAction("link", l.id, -1))}>
                      <ArrowUpIcon />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7" aria-label={t("moveDown")} disabled={pending || li === c.links.length - 1} onClick={() => run(() => moveFooterItemAction("link", l.id, 1))}>
                      <ArrowDownIcon />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7" aria-label={t("editLink")} onClick={() => setLink({ ...l, columnId: c.id })}>
                      <PencilIcon />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7 text-destructive" aria-label={t("deleteLink")} disabled={pending} onClick={() => run(() => deleteFooterLinkAction(l.id))}>
                      <Trash2Icon />
                    </Button>
                  </li>
                ))}
                {c.pages.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 rounded-md py-1 pl-2 text-sm text-muted-foreground">
                    <FileTextIcon className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{p.title}</span>
                    <span className="ml-auto shrink-0 rounded bg-muted px-1.5 text-[11px]">{t("fromPage")}</span>
                  </li>
                ))}
                {c.links.length === 0 && c.pages.length === 0 && <li className="text-sm text-muted-foreground">{t("emptyColumn")}</li>}
              </ul>
              <Button variant="outline" size="sm" className="w-fit" onClick={() => setLink(blankLink(c.id))}>
                <PlusIcon />
                {t("addLink")}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <FooterSettingsForm settings={settings} />

      <Dialog open={column !== null} onOpenChange={(open) => !open && setColumn(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{column?.id ? t("editColumn") : t("addColumn")}</DialogTitle>
            <DialogDescription>{t("columnHint")}</DialogDescription>
          </DialogHeader>
          {column && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="fc-nl" label={t("titleNl")}>
                <Input id="fc-nl" maxLength={80} value={column.titleNl} onChange={(e) => setColumn({ ...column, titleNl: e.target.value })} />
              </FormField>
              <FormField id="fc-en" label={t("titleEn")}>
                <Input id="fc-en" maxLength={80} value={column.titleEn} onChange={(e) => setColumn({ ...column, titleEn: e.target.value })} />
              </FormField>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setColumn(null)}>
              {t("cancel")}
            </Button>
            <Button disabled={pending || !column?.titleNl.trim() || !column?.titleEn.trim()} onClick={() => column && run(() => saveFooterColumnAction(column.id, column), () => setColumn(null))}>
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={link !== null} onOpenChange={(open) => !open && setLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{link?.id ? t("editLink") : t("addLink")}</DialogTitle>
            <DialogDescription>{t("linkHint")}</DialogDescription>
          </DialogHeader>
          {link && (
            <div className="grid gap-4">
              <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm" role="radiogroup" aria-label={t("linkKind")}>
                {(["route", "url"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={link.kind === k}
                    onClick={() => setLink({ ...link, kind: k, target: k === "route" ? "/" : "https://" })}
                    className={`flex-1 rounded-md px-3 py-1.5 ${link.kind === k ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}
                  >
                    {t(`kind_${k}`)}
                  </button>
                ))}
              </div>
              {link.kind === "route" ? (
                <FormField id="fl-route" label={t("page")}>
                  <select
                    id="fl-route"
                    value={siteRoutes.some((r) => r.path === link.target) ? link.target : ""}
                    onChange={(e) => {
                      const route = siteRoutes.find((r) => r.path === e.target.value);
                      if (route) setLink({ ...link, target: route.path, labelNl: link.labelNl || route.nl, labelEn: link.labelEn || route.en });
                    }}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="" disabled>
                      {t("choosePage")}
                    </option>
                    {siteRoutes.map((r) => (
                      <option key={r.path} value={r.path}>
                        {(locale === "en" ? r.en : r.nl) + " · " + r.path}
                      </option>
                    ))}
                  </select>
                </FormField>
              ) : (
                <FormField id="fl-url" label={t("url")}>
                  <Input id="fl-url" value={link.target} onChange={(e) => setLink({ ...link, target: e.target.value })} placeholder="https://" />
                </FormField>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="fl-nl" label={t("labelNl")}>
                  <Input id="fl-nl" maxLength={120} value={link.labelNl} onChange={(e) => setLink({ ...link, labelNl: e.target.value })} />
                </FormField>
                <FormField id="fl-en" label={t("labelEn")}>
                  <Input id="fl-en" maxLength={120} value={link.labelEn} onChange={(e) => setLink({ ...link, labelEn: e.target.value })} />
                </FormField>
              </div>
              {link.kind === "url" && (
                <div className="flex items-center gap-2">
                  <Switch id="fl-tab" checked={link.newTab} onCheckedChange={(newTab) => setLink({ ...link, newTab })} />
                  <label htmlFor="fl-tab" className="text-sm">
                    {t("newTab")}
                  </label>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLink(null)}>
              {t("cancel")}
            </Button>
            <Button
              disabled={pending || !link?.labelNl.trim() || !link?.labelEn.trim()}
              onClick={() => link && run(() => saveFooterLinkAction(link.id || null, { columnId: link.columnId, kind: link.kind, target: link.target, labelNl: link.labelNl, labelEn: link.labelEn, newTab: link.newTab }), () => setLink(null))}
            >
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FooterSettingsForm({ settings }: { settings: FooterSettings }) {
  const t = useTranslations("footerAdmin");
  const [v, setV] = useState(settings);
  const [pending, run] = useRun();
  const field = (key: Exclude<keyof FooterSettings, "socials">, wide = false) => (
    <FormField id={`fs-${key}`} label={t(`f_${key}`)} className={wide ? "sm:col-span-2" : undefined}>
      <Input id={`fs-${key}`} value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} />
    </FormField>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settingsTitle")}</CardTitle>
        <CardDescription>{t("settingsHint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {field("taglineNl", true)}
          {field("taglineEn", true)}
          {field("email")}
          {field("phone")}
          {field("address", true)}
          {field("kvkNumber")}
          {field("vatNumber")}
          {field("bottomNl")}
          {field("bottomEn")}
        </div>
        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-medium">{t("socials")}</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(v.socials) as (keyof FooterSettings["socials"])[]).map((k) => (
              <FormField key={k} id={`fs-social-${k}`} label={t(`social_${k}`)}>
                <Input id={`fs-social-${k}`} value={v.socials[k]} placeholder="https://" onChange={(e) => setV({ ...v, socials: { ...v.socials, [k]: e.target.value } })} />
              </FormField>
            ))}
          </div>
        </fieldset>
        <Button className="w-fit" disabled={pending} onClick={() => run(() => saveFooterSettingsAction(v))}>
          {t("saveSettings")}
        </Button>
      </CardContent>
    </Card>
  );
}
