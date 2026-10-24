import { BanknoteIcon, ClockIcon, HandshakeIcon, UsersIcon, WalletIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { tierFor } from "@stagedesk/core";
import { getSetting, prisma } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { euro, eventDate, percent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/lib/viewer";
import { CommissionsTab, ReportTab, WithdrawalsTab } from "./admin-tabs";
import { AffiliateMenu, ApplicationButtons, CreatePartnerDialog, AssetDialog, type AssetValues, DeleteAssetButton, ReviewButtons } from "./controls";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/affiliates">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "affiliatesAdmin" });
  return { title: t("title") };
}

export default async function AffiliatesPage({ params, searchParams }: PageProps<"/[locale]/app/affiliates">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
      <AffiliatesTabs searchParams={searchParams} />
    </Suspense>
  );
}

const tabs = ["overview", "partners", "withdrawals", "commissions"] as const;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

/** The affiliate program for platform admins: report, partners, withdrawals and every commission. */
async function AffiliatesTabs({ searchParams }: Pick<PageProps<"/[locale]/app/affiliates">, "searchParams">) {
  await requirePermission("platform.affiliates");
  const sp = await searchParams;
  const tab = tabs.find((x) => x === one(sp["tab"])) ?? "overview";
  const [t, open] = await Promise.all([getTranslations("affiliatesAdmin"), prisma.affiliatePayout.count({ where: { status: "requested" } })]);
  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} actions={<CreatePartnerDialog />} />
      <nav className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm" aria-label={t("title")}>
        {tabs.map((x) => (
          <Link
            key={x}
            href={x === "overview" ? "/app/affiliates" : `/app/affiliates?tab=${x}`}
            aria-current={x === tab ? "page" : undefined}
            className={cn("rounded-md px-3 py-1.5", x === tab ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {t(`tab_${x}`)}
            {x === "withdrawals" && open > 0 && <span className="ml-1.5 rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">{open}</span>}
          </Link>
        ))}
      </nav>
      {tab === "overview" ? (
        <ReportTab range={one(sp["range"]) ?? ""} />
      ) : tab === "withdrawals" ? (
        <WithdrawalsTab status={one(sp["status"])} />
      ) : tab === "commissions" ? (
        <CommissionsTab status={one(sp["status"])} affiliateId={one(sp["affiliate"])} />
      ) : (
        <Affiliates />
      )}
    </div>
  );
}

const statusTone = { pending: "info", approved: "success", rejected: "neutral", suspended: "danger" } as const;
const loc = (value: unknown, locale: string) => ((value ?? {}) as Record<string, string>)[locale] ?? "";

async function Affiliates() {
  // Platform-wide view: affiliates aren't tenant data.
  const [t, ta, format, locale, program, affiliates, sums, referrals, review, rejected, assets] = await Promise.all([
    getTranslations("affiliatesAdmin"),
    getTranslations("affiliate"),
    getFormatter(),
    getLocale(),
    getSetting("affiliates.program"),
    prisma.affiliate.findMany({ orderBy: { createdAt: "desc" }, include: { user: { select: { name: true, email: true } } } }),
    prisma.commission.groupBy({ by: ["affiliateId", "status"], _sum: { amountCents: true } }),
    prisma.referral.groupBy({ by: ["affiliateId"], where: { status: "active", type: "affiliate" }, _count: { _all: true } }),
    prisma.commission.findMany({
      where: { status: "review" },
      orderBy: { createdAt: "asc" },
      include: { affiliate: { include: { user: { select: { name: true } } } }, referral: { select: { agency: { select: { name: true } } } } },
    }),
    prisma.referral.findMany({
      where: { status: "rejected" },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { agency: { select: { name: true } }, affiliate: { include: { user: { select: { name: true } } } }, referringAgency: { select: { name: true } } },
    }),
    prisma.affiliateAsset.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
  ]);
  const paying = await prisma.referral.groupBy({ by: ["affiliateId"], where: { status: "active", type: "affiliate", firstPaidAt: { not: null } }, _count: { _all: true } });

  const sum = (affiliateId: string | null, statuses: string[]) =>
    sums.filter((s) => (affiliateId === null || s.affiliateId === affiliateId) && statuses.includes(s.status)).reduce((total, s) => total + (s._sum.amountCents ?? 0), 0);
  const count = (rows: { affiliateId: string | null; _count: { _all: number } }[], id: string) => rows.find((r) => r.affiliateId === id)?._count._all ?? 0;
  const applications = affiliates.filter((a) => a.status === "pending");
  const members = affiliates.filter((a) => a.status !== "pending");

  return (
    <div className="grid gap-6">
      <HowPartnersJoin />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} icon={UsersIcon} label={t("active")} value={affiliates.filter((a) => a.status === "approved").length} hint={t("applicationsWaiting", { count: applications.length })} />
        <StatCard index={1} icon={ClockIcon} label={t("toApprove")} value={euro(format, sum(null, ["pending", "review"]))} hint={t("reviewWaiting", { count: review.length })} />
        <StatCard index={2} icon={WalletIcon} label={t("due")} value={euro(format, sum(null, ["approved"]))} hint={t("dueHint", { day: program.payoutDayOfMonth })} />
        <StatCard index={3} icon={BanknoteIcon} label={t("paidOut")} value={euro(format, sum(null, ["paid"]))} />
      </div>

      {applications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("applications")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {applications.map((a) => (
              <div key={a.id} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="grid gap-1 text-sm">
                  <p className="font-medium">
                    {a.user.name} <span className="font-normal text-muted-foreground">· {a.user.email}</span>
                  </p>
                  {a.website && (
                    <a href={a.website} target="_blank" rel="noopener noreferrer" className="w-fit text-primary underline-offset-4 hover:underline">
                      {a.website}
                    </a>
                  )}
                  {a.pitch && <p className="whitespace-pre-line text-muted-foreground">{a.pitch}</p>}
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">?via={a.code}</span> · <span className="font-mono">{a.promoCode}</span> · {eventDate(format, a.createdAt, "short")}
                  </p>
                </div>
                <ApplicationButtons affiliateId={a.id} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("partners")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {members.length === 0 ? (
            <EmptyState icon={HandshakeIcon} title={t("empty")} description={t("emptyHint")} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("partner")}</TableHead>
                  <TableHead>{t("codes")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead className="text-right">{t("rate")}</TableHead>
                  <TableHead className="text-right">{t("agencies")}</TableHead>
                  <TableHead className="text-right">{t("earned")}</TableHead>
                  <TableHead className="text-right">{t("unpaid")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((a) => {
                  const payingCount = count(paying, a.id);
                  const rate = a.commissionBps ?? tierFor(program.tiers, payingCount)?.commissionBps ?? program.commissionBps;
                  const unpaid = sum(a.id, ["approved"]);
                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div className="font-medium">{a.user.name}</div>
                        <div className="text-sm text-muted-foreground">{a.user.email}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <div>?via={a.code}</div>
                        <div className="text-muted-foreground">{a.promoCode}</div>
                      </TableCell>
                      <TableCell>
                        <Pill tone={statusTone[a.status as keyof typeof statusTone] ?? "neutral"}>{t(`status_${a.status as "approved"}`)}</Pill>
                        {a.status === "approved" && !a.payoutsEnabled && <div className="mt-1 text-xs text-muted-foreground">{t("noPayoutAccount")}</div>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {percent(format, rate)}
                        {a.commissionBps !== null && <div className="text-xs text-muted-foreground">{t("custom")}</div>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {payingCount} / {count(referrals, a.id)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{euro(format, sum(a.id, ["pending", "review", "approved", "paid"]))}</TableCell>
                      <TableCell className="text-right tabular-nums">{euro(format, unpaid)}</TableCell>
                      <TableCell className="text-right">
                        <AffiliateMenu
                          affiliateId={a.id}
                          name={a.user.name}
                          status={a.status}
                          canPay={a.status === "approved" && a.payoutsEnabled && unpaid > 0}
                          values={{
                            code: a.code,
                            promoCode: a.promoCode,
                            website: a.website ?? "",
                            pitch: a.pitch ?? "",
                            ratePercent: a.commissionBps === null ? "" : String(a.commissionBps / 100).replace(".", locale === "en" ? "." : ","),
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {review.length > 0 && (
        <Card className="border-warning/60">
          <CardHeader>
            <CardTitle>{t("reviewTitle")}</CardTitle>
            <CardDescription>{t("reviewHint", { amount: euro(format, program.reviewThresholdCents) })}</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableBody>
                {review.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.affiliate.user.name}</TableCell>
                    <TableCell>{c.referral.agency.name}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{eventDate(format, c.createdAt, "short")}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{euro(format, c.amountCents)}</TableCell>
                    <TableCell>
                      <ReviewButtons commissionId={c.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {rejected.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("blockedTitle")}</CardTitle>
            <CardDescription>{t("blockedHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {rejected.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {r.agency.name} <span className="text-muted-foreground">← {r.affiliate?.user.name ?? r.referringAgency?.name ?? "—"}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <Pill tone="danger">{t(`reason_${(r.rejectReason ?? "same_user") as "same_user"}`)}</Pill>
                    <span className="text-muted-foreground tabular-nums">{eventDate(format, r.createdAt, "short")}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{ta("assets")}</CardTitle>
          <CardDescription>{t("assetsHint")}</CardDescription>
          <CardAction>
            <AssetDialog />
          </CardAction>
        </CardHeader>
        <CardContent>
          {assets.length === 0 ? (
            <p className="text-sm text-muted-foreground">{ta("noAssets")}</p>
          ) : (
            <ul className="divide-y text-sm">
              {assets.map((a) => {
                const title = (a.title ?? {}) as Record<string, string>;
                const description = (a.description ?? {}) as Record<string, string>;
                const values: AssetValues = {
                  id: a.id,
                  kind: a.kind as AssetValues["kind"],
                  titleNl: title["nl"] ?? "",
                  titleEn: title["en"] ?? "",
                  descriptionNl: description["nl"] ?? "",
                  descriptionEn: description["en"] ?? "",
                  url: a.url,
                };
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="font-medium">{loc(a.title, locale)}</span>{" "}
                      <span className="text-muted-foreground">· {t(`kind_${a.kind as "logo"}`)}</span>
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <AssetDialog asset={values} />
                      <DeleteAssetButton id={a.id} />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Explains the two ways a partner gets in, with the public application link. */
async function HowPartnersJoin() {
  const t = await getTranslations("affiliatesAdmin");
  const steps = ["join1", "join2", "join3"] as const;
  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-magenta/5">
      <CardHeader>
        <CardTitle>{t("joinTitle")}</CardTitle>
        <CardDescription>{t("joinHint")}</CardDescription>
        <CardAction>
          <Button asChild variant="outline" size="sm">
            <a href="/partners" target="_blank" rel="noopener">
              {t("openPartnerPage")}
            </a>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-4 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s} className="grid grid-cols-[2rem_1fr] gap-3">
              <span className="flex size-8 items-center justify-center rounded-full bg-brand-gradient text-sm font-semibold text-white tabular-nums">{i + 1}</span>
              <span className="grid gap-0.5 text-sm">
                <span className="font-medium">{t(`${s}Title`)}</span>
                <span className="text-muted-foreground">{t(`${s}Body`)}</span>
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
