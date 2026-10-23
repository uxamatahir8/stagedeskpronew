import { LifeBuoyIcon, LogOutIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { stopSupportAction } from "@/lib/support-actions";

/** Shown on every page while a platform admin works inside an agency as support. */
export async function SupportBanner({ agency }: { agency: string }) {
  const t = await getTranslations("supportMode");
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 border-b border-warning/40 bg-warning/15 px-4 py-2 text-sm md:px-6">
      <p className="flex items-center gap-2">
        <LifeBuoyIcon className="size-4 shrink-0" aria-hidden />
        <span>{t.rich("banner", { agency, b: (c) => <strong className="font-semibold">{c}</strong> })}</span>
      </p>
      <form action={stopSupportAction}>
        <Button type="submit" size="sm" variant="outline" className="bg-background">
          <LogOutIcon />
          {t("leave")}
        </Button>
      </form>
    </div>
  );
}
