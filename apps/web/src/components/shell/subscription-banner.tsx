import { getTranslations } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";

import { agencyBilling } from "@stagedesk/db";
import { Link } from "@/i18n/navigation";
import { dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Whole days from now until `date`, never negative. The dashboard renders per request. */
function daysUntil(date: Date) {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86_400_000));
}

/** Trial countdown, grace warning or read-only notice for the agency team. */
export async function SubscriptionBanner({ organizationId, canBill }: { organizationId: string; canBill: boolean }) {
  const [{ access }, t, format] = await Promise.all([agencyBilling(organizationId), getTranslations("billing"), getFormatter()]);
  if (access.reason === "active" || access.reason === "free") return null;

  let text: string;
  let tone: "info" | "warning" | "danger";
  if (access.reason === "trial" && access.until) {
    const days = daysUntil(access.until);
    // Only bother people in the last week of the trial.
    if (days > 7) return null;
    text = t("bannerTrial", { count: days });
    tone = "info";
  } else if (access.reason === "grace" && access.until) {
    text = t("bannerGrace", { date: dateTime(format, access.until) });
    tone = "warning";
  } else if (access.reason === "none") {
    text = t("bannerNone");
    tone = "warning";
  } else {
    text = t("bannerReadOnly");
    tone = "danger";
  }

  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm md:px-6",
        tone === "info" && "bg-info/10 text-foreground",
        tone === "warning" && "bg-warning/18 text-foreground",
        tone === "danger" && "bg-destructive/10 text-destructive",
      )}
    >
      <span>{text}</span>
      {canBill && (
        <Link href="/app/billing" className="font-medium underline underline-offset-4">
          {t("bannerAction")}
        </Link>
      )}
    </div>
  );
}
