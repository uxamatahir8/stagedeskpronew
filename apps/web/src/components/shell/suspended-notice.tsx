import { PauseCircleIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** Shown instead of every page while the platform admin has suspended the agency. */
export async function SuspendedNotice({ agency, reason }: { agency: string; reason: string | null }) {
  const t = await getTranslations("agencySuspended");
  return (
    <div className="mx-auto grid max-w-lg justify-items-center gap-4 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-warning/18">
        <PauseCircleIcon className="size-7" aria-hidden />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground">{t("body", { agency })}</p>
      {reason && <p className="rounded-lg bg-muted px-4 py-2 text-sm">{reason}</p>}
      <Button asChild variant="outline">
        <Link href="/contact">{t("contact")}</Link>
      </Button>
    </div>
  );
}
