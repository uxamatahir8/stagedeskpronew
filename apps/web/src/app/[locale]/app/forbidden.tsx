import { ShieldOffIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default async function Forbidden() {
  const t = await getTranslations("errors");
  return (
    <EmptyState
      icon={ShieldOffIcon}
      title={t("forbiddenTitle")}
      description={t("forbiddenBody")}
      action={
        <Button variant="outline" asChild>
          <Link href="/app">{t("backHome")}</Link>
        </Button>
      }
    />
  );
}
