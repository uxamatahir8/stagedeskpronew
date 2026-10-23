import { CalendarClockIcon, CoinsIcon, HourglassIcon, MousePointerClickIcon } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { affiliateOverview } from "@stagedesk/db";
import { FormMessage } from "@/components/auth/auth-card";
import { StatCard } from "@/components/stat-card";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { referralLink } from "@/lib/affiliate";
import { euro, eventDate, percent } from "@/lib/format";
import { CopyField } from "@/components/copy-field";

/** The affiliate's home: funnel, earnings, next payout and tier progress. */
export async function AffiliateHome({ affiliateId }: { affiliateId: string }) {
  const [t, format, o] = await Promise.all([getTranslations("affiliate"), getFormatter(), affiliateOverview(affiliateId)]);
  const { affiliate, funnel, earnings } = o;

  if (affiliate.status !== "approved") {
    return <FormMessage tone={affiliate.status === "pending" ? "success" : undefined}>{t(`status_${affiliate.status as "pending"}`)}</FormMessage>;
  }

  const steps = [
    { key: "clicks", value: funnel.clicksTotal },
    { key: "signups", value: funnel.signups },
    { key: "trials", value: funnel.trials },
    { key: "paying", value: funnel.paying },
  ] as const;
  const max = Math.max(1, ...steps.map((s) => s.value));

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} label={t("clicksMonth")} value={funnel.clicksMonth} hint={t("clicksTotal", { count: funnel.clicksTotal })} icon={MousePointerClickIcon} />
        <StatCard index={1} label={t("payingAgencies")} value={funnel.paying} hint={t("signupsTotal", { count: funnel.signups })} icon={CoinsIcon} />
        <StatCard index={2} label={t("pending")} value={euro(format, earnings.pending)} hint={t("approvedHint", { amount: euro(format, earnings.approved) })} icon={HourglassIcon} />
        <StatCard index={3}
          label={t("nextPayout")}
          value={euro(format, o.nextPayout.amountCents)}
          hint={o.nextPayout.amountCents > 0 ? eventDate(format, o.nextPayout.date) : t("belowMinimum", { amount: euro(format, o.program.minPayoutCents) })}
          icon={CalendarClockIcon}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{t("funnel")}</CardTitle>
            <CardDescription>{t("funnelHint")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {steps.map((s) => (
              <div key={s.key} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3 text-sm">
                <span className="text-muted-foreground">{t(`funnel_${s.key}`)}</span>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((s.value / max) * 100)}%` }} />
                </div>
                <span className="text-right font-medium tabular-nums">{s.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {t("yourRate")}
              {o.tier && <Pill tone="brand">{o.tier.name}</Pill>}
            </CardTitle>
            <CardDescription>
              {o.nextTier
                ? t("nextTier", { tier: o.nextTier.name, rate: percent(format, o.nextTier.commissionBps), count: o.nextTier.minPayingAgencies - funnel.everPaid })
                : t("topTier")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-3xl font-semibold tracking-tight tabular-nums">{percent(format, o.commissionBps)}</p>
            <CopyField label={t("yourLink")} value={referralLink(affiliate.code)} />
            <CopyField label={t("yourCode")} value={affiliate.promoCode} />
            <Button asChild variant="outline" size="sm" className="w-fit">
              <Link href="/app/links">{t("moreLinks")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("byCampaign")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {o.campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noClicks")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("campaign")}</TableHead>
                  <TableHead className="text-right">{t("funnel_clicks")}</TableHead>
                  <TableHead className="text-right">{t("funnel_signups")}</TableHead>
                  <TableHead className="text-right">{t("funnel_paying")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {o.campaigns.map((c) => (
                  <TableRow key={c.campaign ?? ""}>
                    <TableCell className="font-mono text-sm">{c.campaign ?? t("noCampaign")}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.clicks}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.signups}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.paying}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
