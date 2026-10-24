import { SearchIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { listSiteTexts } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { flatten, placeholdersOf } from "@/lib/site-texts";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/lib/viewer";
import en from "../../../../../messages/en.json";
import nl from "../../../../../messages/nl.json";
import { TextRow, type TextRowData } from "./text-row";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/texts">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "siteTexts" });
  return { title: t("title") };
}

export default async function TextsPage({ params, searchParams }: PageProps<"/[locale]/app/texts">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Texts searchParams={searchParams} />
    </Suspense>
  );
}

/** The public website first, in the order a visitor meets it; everything else after. */
const websiteGroups = [
  "site",
  "landing",
  "featuresPage",
  "featureDetail",
  "detailPage",
  "forAgencies",
  "forArtists",
  "pricingPage",
  "about",
  "contactPage",
  "partners",
  "tour",
  "blog",
  "help",
  "changelog",
  "leadForm",
  "infographics",
  "mock",
  "screens",
  "auth",
  "bookingPage",
  "quotePage",
  "agencySite",
  "meta",
  "theme",
] as const;

const fileNl = flatten(nl);
const fileEn = flatten(en);
const allKeys = Object.keys(fileEn);
const namespaces = [...new Set(allKeys.map((k) => k.split(".")[0]!))];
const appGroups = namespaces.filter((n) => !(websiteGroups as readonly string[]).includes(n)).sort();
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

async function Texts({ searchParams }: Pick<PageProps<"/[locale]/app/texts">, "searchParams">) {
  await requirePermission("platform.pages");
  const sp = await searchParams;
  const q = one(sp["q"]).trim().toLowerCase().slice(0, 100);
  const changedOnly = one(sp["changed"]) === "1";
  const ns = namespaces.includes(one(sp["ns"])) ? one(sp["ns"]) : "landing";
  const [t, rows] = await Promise.all([getTranslations("siteTexts"), listSiteTexts()]);
  const overrides = { nl: new Map<string, string>(), en: new Map<string, string>() };
  for (const r of rows) if (r.locale === "nl" || r.locale === "en") overrides[r.locale].set(r.key, r.value);
  const changedKeys = new Set([...overrides.nl.keys(), ...overrides.en.keys()]);
  const changedPer = (n: string) => [...changedKeys].filter((k) => k.startsWith(`${n}.`)).length;

  const keys = allKeys.filter((k) => {
    if (changedOnly) return changedKeys.has(k);
    if (q) return [k, fileNl[k] ?? "", fileEn[k] ?? "", overrides.nl.get(k) ?? "", overrides.en.get(k) ?? ""].some((s) => s.toLowerCase().includes(q));
    return k.startsWith(`${ns}.`);
  });
  const shown = keys.slice(0, 300);
  const data: TextRowData[] = shown.map((k) => ({
    key: k,
    placeholders: placeholdersOf(fileEn[k] ?? ""),
    nl: { file: fileNl[k] ?? "", override: overrides.nl.get(k) ?? null },
    en: { file: fileEn[k] ?? "", override: overrides.en.get(k) ?? null },
  }));
  const label = (n: string) => (t.has(`ns.${n}` as "ns.site") ? t(`ns.${n}` as "ns.site") : n);

  const nsLink = (n: string) => (
    <li key={n}>
      <Link
        href={`/app/texts?ns=${n}`}
        aria-current={!q && !changedOnly && n === ns ? "page" : undefined}
        className={cn(
          "flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm",
          !q && !changedOnly && n === ns ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        )}
      >
        <span className="min-w-0 truncate" title={label(n)}>{label(n)}</span>
        {changedPer(n) > 0 && <span className="rounded bg-primary/12 px-1.5 text-xs text-primary tabular-nums">{changedPer(n)}</span>}
      </Link>
    </li>
  );

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label={t("groups")} className="flex min-w-0 flex-col gap-4">
          <Link
            href="/app/texts?changed=1"
            aria-current={changedOnly ? "page" : undefined}
            className={cn("flex items-center justify-between rounded-md border px-2.5 py-2 text-sm", changedOnly ? "border-primary/40 bg-primary/5 font-medium" : "hover:bg-muted/60")}
          >
            {t("allChanged")}
            <span className="tabular-nums">{changedKeys.size}</span>
          </Link>
          <div className="flex flex-col gap-1">
            <p className="px-2.5 text-xs font-semibold text-muted-foreground uppercase">{t("website")}</p>
            <ul className="flex flex-col">{websiteGroups.filter((n) => namespaces.includes(n)).map(nsLink)}</ul>
          </div>
          <details>
            <summary className="cursor-pointer px-2.5 text-xs font-semibold text-muted-foreground uppercase">{t("app")}</summary>
            <ul className="mt-1 flex flex-col">{appGroups.map(nsLink)}</ul>
          </details>
        </nav>

        <div className="grid min-w-0 content-start gap-4">
          <form className="flex gap-2">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input name="q" type="search" defaultValue={q} placeholder={t("searchPlaceholder")} aria-label={t("search")} className="pl-9" />
            </div>
            <Button type="submit" variant="outline">
              {t("search")}
            </Button>
          </form>
          <p className="text-sm text-muted-foreground">
            {q ? t("results", { count: keys.length, q }) : changedOnly ? t("changedCount", { count: keys.length }) : t("groupCount", { group: label(ns), count: keys.length })}
            {keys.length > shown.length && ` ${t("firstOnly", { count: shown.length })}`}
          </p>
          <Card>
            <CardContent>
              {data.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">{t("none")}</p>
              ) : (
                <ul>
                  {data.map((row) => (
                    <TextRow key={`${row.key}:${row.nl.override ?? ""}:${row.en.override ?? ""}`} row={row} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
        </div>
      </div>
    </div>
  );
}
