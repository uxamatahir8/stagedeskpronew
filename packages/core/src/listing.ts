/**
 * Search, filters, sorting and paging for every listing, kept in the URL so a
 * list can be bookmarked, shared and reloaded as it was.
 *   ?q=text&sort=column&dir=asc|desc&page=2&size=50&<filter>=<value>
 */

export type SortDir = "asc" | "desc";

export interface ListSpec<S extends string = string, F extends string = string> {
  /** Columns that can be sorted; the first is the default unless `defaultSort` says otherwise. */
  sorts: readonly S[];
  defaultSort?: S;
  defaultDir?: SortDir;
  /** Filter name → allowed values. Anything else in the URL is ignored. */
  filters?: Readonly<Record<F, readonly string[]>>;
  pageSize?: number;
}

export interface ListQuery<S extends string = string, F extends string = string> {
  q: string;
  sort: S;
  dir: SortDir;
  page: number;
  size: number;
  filters: Partial<Record<F, string>>;
}

export const pageSizes = [10, 25, 50, 100] as const;

type Raw = Record<string, string | string[] | undefined> | URLSearchParams;

const read = (raw: Raw, key: string) => {
  const v = raw instanceof URLSearchParams ? raw.get(key) : raw[key];
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
};

/** Reads and validates list parameters; unknown or malformed values fall back to the defaults. */
export function parseListQuery<S extends string, F extends string = never>(raw: Raw, spec: ListSpec<S, F>): ListQuery<S, F> {
  const fallback = spec.defaultSort ?? spec.sorts[0]!;
  const sortRaw = read(raw, "sort");
  const sort = sortRaw && (spec.sorts as readonly string[]).includes(sortRaw) ? (sortRaw as S) : fallback;
  const dirRaw = read(raw, "dir");
  const dir: SortDir = dirRaw === "asc" || dirRaw === "desc" ? dirRaw : (spec.defaultDir ?? "desc");
  const sizeRaw = Number(read(raw, "size"));
  const size = (pageSizes as readonly number[]).includes(sizeRaw) ? sizeRaw : (spec.pageSize ?? 25);
  const page = Math.max(1, Math.min(10_000, Math.floor(Number(read(raw, "page")) || 1)));
  const filters: Partial<Record<F, string>> = {};
  for (const [key, allowed] of Object.entries(spec.filters ?? {}) as [F, readonly string[]][]) {
    const v = read(raw, key);
    if (v && allowed.includes(v)) filters[key] = v;
  }
  return { q: (read(raw, "q") ?? "").trim().slice(0, 100), sort, dir, page, size, filters };
}

/** The URL for the same list with some parameters changed. Defaults are left out; any change but paging goes back to page 1. */
export function listHref(path: string, query: ListQuery, patch: Partial<Record<string, string | number | null>>, spec?: ListSpec) {
  const values: Record<string, string | number | null | undefined> = {
    q: query.q || null,
    sort: query.sort,
    dir: query.dir,
    // Only a paging link keeps a page; a new sort, filter or search starts at page 1.
    page: null,
    size: query.size,
    ...query.filters,
    ...patch,
  };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) {
    if (v === null || v === undefined || v === "") continue;
    if (k === "page" && Number(v) <= 1) continue;
    if (spec && k === "sort" && v === (spec.defaultSort ?? spec.sorts[0]) && values["dir"] === (spec.defaultDir ?? "desc")) continue;
    if (spec && k === "dir" && values["sort"] === (spec.defaultSort ?? spec.sorts[0]) && v === (spec.defaultDir ?? "desc")) continue;
    if (k === "size" && Number(v) === (spec?.pageSize ?? 25)) continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `${path}?${s}` : path;
}

/** Skip/take for a page, and how many pages there are. */
export function pageWindow(query: Pick<ListQuery, "page" | "size">, total: number) {
  const pages = Math.max(1, Math.ceil(total / query.size));
  const page = Math.min(query.page, pages);
  return { skip: (page - 1) * query.size, take: query.size, page, pages, total };
}

/** Sorts rows in memory by a column's value: numbers and dates numerically, text by locale, empty last. */
export function sortRows<T>(rows: readonly T[], value: (row: T) => string | number | Date | null | undefined, dir: SortDir, locale = "nl") {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  const key = (v: string | number | Date | null | undefined) => (v instanceof Date ? v.getTime() : v);
  return [...rows].sort((a, b) => {
    const x = key(value(a));
    const y = key(value(b));
    if (x === y) return 0;
    if (x === null || x === undefined || x === "") return 1;
    if (y === null || y === undefined || y === "") return -1;
    const c = typeof x === "number" && typeof y === "number" ? x - y : collator.compare(String(x), String(y));
    return dir === "asc" ? c : -c;
  });
}

/** Case- and accent-insensitive match of every word in `q` against the text. */
export function matchesSearch(text: string, q: string) {
  if (!q) return true;
  const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const hay = fold(text);
  return fold(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}
