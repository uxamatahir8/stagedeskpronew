import { ShieldOffIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getViewer } from "@/lib/viewer";

export default async function Forbidden() {
  const [t, viewer] = await Promise.all([getTranslations("errors"), getViewer()]);
  // Only the agency's own team can ask an owner or admin for access; customers, artists and partners can't.
  const team = viewer?.role === "agency_admin" || viewer?.role === "agency_staff";
  return (
    <EmptyState
      icon={ShieldOffIcon}
      title={t("forbiddenTitle")}
      description={team ? t("forbiddenBody") : t("forbiddenBodyNotForYou")}
      action={
        <Button variant="outline" asChild>
          <Link href="/app">{t("backHome")}</Link>
        </Button>
      }
    />
  );
}
