import { describe, expect, it } from "vitest";
import { listHref, matchesSearch, pageWindow, parseListQuery, sortRows } from "./listing";

const spec = { sorts: ["date", "name", "amount"] as const, defaultDir: "desc" as const, filters: { status: ["open", "paid"] } as const };

describe("list parameters", () => {
  it("reads valid values and ignores the rest", () => {
    expect(parseListQuery({ q: "  sem ", sort: "name", dir: "asc", page: "3", size: "50", status: "paid" }, spec)).toEqual({
      q: "sem",
      sort: "name",
      dir: "asc",
      page: 3,
      size: 50,
      filters: { status: "paid" },
    });
    expect(parseListQuery({ sort: "password", dir: "sideways", page: "-4", size: "7", status: "hacked" }, spec)).toEqual({
      q: "",
      sort: "date",
      dir: "desc",
      page: 1,
      size: 25,
      filters: {},
    });
    expect(parseListQuery(new URLSearchParams("sort=amount"), spec).sort).toBe("amount");
  });

  it("builds links that drop defaults and reset the page", () => {
    const q = parseListQuery({ q: "sem", page: "4", status: "open" }, spec);
    expect(listHref("/app/x", q, { sort: "name", dir: "asc" }, spec)).toBe("/app/x?q=sem&sort=name&dir=asc&status=open");
    expect(listHref("/app/x", q, { page: 5 }, spec)).toBe("/app/x?q=sem&page=5&status=open");
    expect(listHref("/app/x", q, { status: null, q: null }, spec)).toBe("/app/x");
  });

  it("clamps the page to what exists", () => {
    expect(pageWindow({ page: 9, size: 25 }, 60)).toEqual({ skip: 50, take: 25, page: 3, pages: 3, total: 60 });
    expect(pageWindow({ page: 1, size: 25 }, 0)).toMatchObject({ skip: 0, pages: 1 });
  });
});

describe("in-memory lists", () => {
  it("sorts numbers, dates and text, with empty values last", () => {
    const rows = [{ v: 10 }, { v: null }, { v: 2 }];
    expect(sortRows(rows, (r) => r.v, "asc").map((r) => r.v)).toEqual([2, 10, null]);
    expect(sortRows(rows, (r) => r.v, "desc").map((r) => r.v)).toEqual([10, 2, null]);
    expect(sortRows([{ v: "Zoë" }, { v: "anna" }, { v: "Émile" }], (r) => r.v, "asc").map((r) => r.v)).toEqual(["anna", "Émile", "Zoë"]);
    const d = (s: string) => new Date(s);
    expect(sortRows([{ v: d("2026-02-01") }, { v: d("2026-01-01") }], (r) => r.v, "asc")[0]!.v).toEqual(d("2026-01-01"));
  });

  it("matches every word, ignoring case and accents", () => {
    expect(matchesSearch("Bruiloft Émile & Zoë, Utrecht", "emile utrecht")).toBe(true);
    expect(matchesSearch("Bruiloft Émile & Zoë, Utrecht", "emile amsterdam")).toBe(false);
    expect(matchesSearch("anything", "")).toBe(true);
  });
});
