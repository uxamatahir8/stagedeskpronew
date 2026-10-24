"use client";

import { useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { listHref, type ListQuery, type ListSpec, parseListQuery } from "@stagedesk/core";
import { usePathname, useRouter } from "@/i18n/navigation";

/** The list parameters in the URL, and a way to change them (replacing history, keeping scroll). */
export function useListQuery(spec: ListSpec) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  const query = parseListQuery(params, spec) as ListQuery;
  // Parameters the list doesn't own (a tab, a dialog) stay in the URL.
  const owned = new Set(["q", "sort", "dir", "page", "size", ...Object.keys(spec.filters ?? {})].map((k) => (spec.prefix ?? "") + k));
  const href = (patch: Record<string, string | number | null>) => {
    const base = listHref(pathname, query, patch, spec);
    const extra = new URLSearchParams([...params.entries()].filter(([k]) => !owned.has(k)));
    if (extra.size === 0) return base;
    return base + (base.includes("?") ? "&" : "?") + extra.toString();
  };
  const set = (patch: Record<string, string | number | null>) => start(() => router.replace(href(patch), { scroll: false }));
  return { query, set, href, pending };
}
