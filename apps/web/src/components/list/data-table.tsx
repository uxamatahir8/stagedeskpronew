"use client";

import { SearchXIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type ListSpec, matchesSearch, sortRows } from "@stagedesk/core";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { type ListFilter, ListPager, ListToolbar, SortHead } from "./list-controls";
import { useListQuery } from "./use-list-query";
import { NativeSelect } from "@/components/ui/native-select";

export interface DataColumn {
  label: React.ReactNode;
  /** The sort key from the spec; leave out for columns that don't sort. */
  sort?: string;
  align?: "right";
  className?: string;
}

export interface DataRow {
  id: string;
  cells: React.ReactNode[];
  /** Sort key → the raw value to sort on. */
  values: Record<string, string | number | null>;
  /** Everything the search box should find this row by. */
  text: string;
  /** Filter key → this row's value. */
  facets?: Record<string, string>;
  className?: string;
}

/**
 * A list small enough to load at once (one agency's services, a team, a
 * partner's payouts), with the same search, filters, sorting and paging as
 * server-paged lists. Rows are rendered on the server; this only arranges them.
 */
export function DataTable({
  spec,
  columns,
  rows,
  filters,
  placeholder,
  toolbar,
  empty,
}: {
  spec: ListSpec;
  columns: DataColumn[];
  rows: DataRow[];
  filters?: ListFilter[];
  placeholder?: string;
  toolbar?: React.ReactNode;
  /** Shown when there are no rows at all (not when a search finds nothing). */
  empty?: React.ReactNode;
}) {
  const t = useTranslations("list");
  const locale = useLocale();
  const { query } = useListQuery(spec);
  const facets = query.filters as Record<string, string>;
  const matching = rows.filter((r) => matchesSearch(r.text, query.q) && Object.entries(facets).every(([k, v]) => r.facets?.[k] === v));
  const sorted = sortRows(matching, (r) => r.values[query.sort], query.dir, locale);
  const pages = Math.max(1, Math.ceil(sorted.length / query.size));
  const page = Math.min(query.page, pages);
  const visible = sorted.slice((page - 1) * query.size, page * query.size);

  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className="grid gap-3">
      <ListToolbar spec={spec} placeholder={placeholder} filters={filters}>
        {toolbar}
      </ListToolbar>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c, i) =>
                c.sort ? (
                  <SortHead key={i} spec={spec} column={c.sort} align={c.align} className={c.className}>
                    {c.label}
                  </SortHead>
                ) : (
                  <TableHead key={i} className={cn(c.align === "right" && "text-right", c.className)}>
                    {c.label}
                  </TableHead>
                ),
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r) => (
              <TableRow key={r.id} className={r.className}>
                {r.cells.map((cell, i) => (
                  <TableCell key={i} className={cn(columns[i]?.align === "right" && "text-right tabular-nums", columns[i]?.className)}>
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-10 text-center text-muted-foreground">
                  <SearchXIcon className="mx-auto mb-2 size-5" aria-hidden />
                  {t("noMatches")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <ListPager spec={spec} total={sorted.length} />
    </div>
  );
}

export interface CardItem {
  id: string;
  node: React.ReactNode;
  values: Record<string, string | number | null>;
  text: string;
  facets?: Record<string, string>;
}

/** Cards (artists, reviews, gigs) with the same search, filters, sorting and paging as the tables. */
export function CardList({
  spec,
  items,
  sorts,
  filters,
  placeholder,
  className,
}: {
  spec: ListSpec;
  items: CardItem[];
  /** Sort key → label, offered in a menu since cards have no column headers. */
  sorts: { key: string; label: string }[];
  filters?: ListFilter[];
  placeholder?: string;
  className?: string;
}) {
  const t = useTranslations("list");
  const locale = useLocale();
  const { query, set } = useListQuery(spec);
  const facets = query.filters as Record<string, string>;
  const matching = items.filter((r) => matchesSearch(r.text, query.q) && Object.entries(facets).every(([k, v]) => r.facets?.[k] === v));
  const sorted = sortRows(matching, (r) => r.values[query.sort], query.dir, locale);
  const pages = Math.max(1, Math.ceil(sorted.length / query.size));
  const page = Math.min(query.page, pages);
  const visible = sorted.slice((page - 1) * query.size, page * query.size);
  return (
    <div className="grid gap-4">
      <ListToolbar spec={spec} placeholder={placeholder} filters={filters}>
        {sorts.length > 1 && (
          <NativeSelect
            aria-label={t("sortLabel")}
            value={`${query.sort}:${query.dir}`}
            onChange={(e) => {
              const [sort, dir] = e.target.value.split(":");
              set({ sort: sort!, dir: dir! });
            }}
            className="h-9 rounded-md border bg-background px-2.5 text-sm"
          >
            {sorts.flatMap((s) => [
              <option key={`${s.key}:asc`} value={`${s.key}:asc`}>
                {t("sortAsc", { column: s.label })}
              </option>,
              <option key={`${s.key}:desc`} value={`${s.key}:desc`}>
                {t("sortDesc", { column: s.label })}
              </option>,
            ])}
          </NativeSelect>
        )}
      </ListToolbar>
      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">{t("noMatches")}</p>
      ) : (
        <div className={className}>{visible.map((r) => <div key={r.id} className="contents">{r.node}</div>)}</div>
      )}
      <ListPager spec={spec} total={sorted.length} />
    </div>
  );
}

/** The same table frame for lists the server pages: headers sort, the body is the server's rows. */
export function ServerTable({ spec, columns, children, total, filters, placeholder, toolbar, count }: {
  spec: ListSpec;
  columns: DataColumn[];
  children: React.ReactNode;
  total: number;
  filters?: ListFilter[];
  placeholder?: string;
  toolbar?: React.ReactNode;
  /** Rows on this page; 0 shows the "nothing found" row. */
  count: number;
}) {
  const t = useTranslations("list");
  return (
    <div className="grid gap-3">
      <ListToolbar spec={spec} placeholder={placeholder} filters={filters}>
        {toolbar}
      </ListToolbar>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c, i) =>
                c.sort ? (
                  <SortHead key={i} spec={spec} column={c.sort} align={c.align} className={c.className}>
                    {c.label}
                  </SortHead>
                ) : (
                  <TableHead key={i} className={cn(c.align === "right" && "text-right", c.className)}>
                    {c.label}
                  </TableHead>
                ),
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {children}
            {count === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-10 text-center text-muted-foreground">
                  <SearchXIcon className="mx-auto mb-2 size-5" aria-hidden />
                  {t("noMatches")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <ListPager spec={spec} total={total} />
    </div>
  );
}
