"use client";

import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, SearchIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { type ListSpec, pageSizes } from "@stagedesk/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useListQuery } from "./use-list-query";
import { NativeSelect } from "@/components/ui/native-select";

export interface ListFilter {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

const selectClass = "h-9 rounded-md border bg-background px-2.5 text-sm text-foreground";

/** Search box and filter menus above a list. Typing searches after a short pause. */
export function ListToolbar({ spec, placeholder, filters = [], children }: { spec: ListSpec; placeholder?: string; filters?: ListFilter[]; children?: React.ReactNode }) {
  const t = useTranslations("list");
  const { query, set, pending } = useListQuery(spec);
  const [text, setText] = useState(query.q);
  const last = useRef(query.q);
  // Back/forward or a link changed the search: show it.
  useEffect(() => {
    if (query.q !== last.current) {
      last.current = query.q;
      setText(query.q);
    }
  }, [query.q]);
  useEffect(() => {
    if (text.trim() === last.current) return;
    const timer = setTimeout(() => {
      last.current = text.trim();
      set({ q: text.trim() || null });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  const active = Boolean(query.q) || Object.keys(query.filters).length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2" role="search" aria-busy={pending}>
      <div className="relative min-w-52 flex-1">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder ?? t("search")} aria-label={placeholder ?? t("search")} className="pl-9" />
      </div>
      {filters.map((f) => (
        <NativeSelect
          key={f.key}
          aria-label={f.label}
          value={(query.filters as Record<string, string>)[f.key] ?? ""}
          onChange={(e) => set({ [f.key]: e.target.value || null })}
          className={cn(selectClass, (query.filters as Record<string, string>)[f.key] && "border-primary")}
        >
          <option value="">{t("allOf", { label: f.label })}</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      ))}
      {children}
      {active && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            last.current = "";
            setText("");
            set({ q: null, ...Object.fromEntries(filters.map((f) => [f.key, null])) });
          }}
        >
          <XIcon />
          {t("clear")}
        </Button>
      )}
    </div>
  );
}

/** A column header that sorts the list; clicking again flips the direction. */
export function SortHead({ spec, column, children, className, align }: { spec: ListSpec; column: string; children: React.ReactNode; className?: string; align?: "right" }) {
  const t = useTranslations("list");
  const { query, set } = useListQuery(spec);
  const activeCol = query.sort === column;
  const Icon = !activeCol ? ArrowUpDownIcon : query.dir === "asc" ? ArrowUpIcon : ArrowDownIcon;
  return (
    <TableHead className={cn(align === "right" && "text-right", className)} aria-sort={activeCol ? (query.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => set({ sort: column, dir: activeCol ? (query.dir === "asc" ? "desc" : "asc") : "asc" })}
        className={cn("-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted", align === "right" && "flex-row-reverse", activeCol ? "text-foreground" : "text-foreground/80")}
        title={t("sortBy", { column: typeof children === "string" ? children : column })}
      >
        {children}
        <Icon className={cn("size-3.5", !activeCol && "opacity-40")} aria-hidden />
      </button>
    </TableHead>
  );
}

/** Page links, the result count and how many rows per page. Hidden when there's nothing to page. */
export function ListPager({ spec, total }: { spec: ListSpec; total: number }) {
  const t = useTranslations("list");
  const { query, set } = useListQuery(spec);
  const pages = Math.max(1, Math.ceil(total / query.size));
  const page = Math.min(query.page, pages);
  if (total <= pageSizes[0]) return total > 0 ? <p className="text-sm text-muted-foreground">{t("results", { count: total })}</p> : null;
  // First, last and the pages around the current one.
  const shown = [...new Set([1, page - 1, page, page + 1, pages])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 text-sm" aria-label={t("pagination")}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>{t("pageOf", { page, pages, total })}</span>
        <NativeSelect aria-label={t("perPage")} value={query.size} onChange={(e) => set({ size: Number(e.target.value) })} className={cn(selectClass, "h-8")}>
          {pageSizes.map((s) => (
            <option key={s} value={s}>
              {t("perPageOption", { count: s })}
            </option>
          ))}
        </NativeSelect>
      </div>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => set({ page: page - 1 })} aria-label={t("previous")}>
            <ChevronLeftIcon />
          </Button>
          {shown.map((p, i) => (
            <span key={p} className="flex items-center gap-1">
              {i > 0 && p - shown[i - 1]! > 1 && <span className="px-1 text-muted-foreground">…</span>}
              <Button variant={p === page ? "default" : "ghost"} size="sm" className="min-w-8 tabular-nums" aria-current={p === page ? "page" : undefined} onClick={() => set({ page: p })}>
                {p}
              </Button>
            </span>
          ))}
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => set({ page: page + 1 })} aria-label={t("next")}>
            <ChevronRightIcon />
          </Button>
        </div>
      )}
    </nav>
  );
}
