import { GiftIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { agencyReferralCode, getSetting, prisma } from "@stagedesk/db";
import { CopyField } from "@/components/copy-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { referralLink } from "@/lib/affiliate";

/** Give a month, get a month: the agency's own invite link and how it's going. */
export async function ReferralCard({ organizationId }: { organizationId: string }) {
  const program = await getSetting("affiliates.program");
  if (program.agencyReferralFreeMonths === 0) return null;
  const [t, code, referred] = await Promise.all([
    getTranslations("agencyReferral"),
    agencyReferralCode(organizationId),
    prisma.referral.findMany({ where: { referringAgencyId: organizationId, status: "active" }, select: { rewardedAt: true } }),
  ]);
  const rewarded = referred.filter((r) => r.rewardedAt).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GiftIcon className="size-4 text-primary" aria-hidden />
          {t("title", { count: program.agencyReferralFreeMonths })}
        </CardTitle>
        <CardDescription>{t("body", { count: program.agencyReferralFreeMonths })}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <CopyField label={t("link")} value={referralLink(code)} />
        <p className="text-sm text-muted-foreground">{t("status", { joined: referred.length, rewarded })}</p>
      </CardContent>
    </Card>
  );
}
