import { UndoIcon, UserRoundIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { stopImpersonationAction } from "@/lib/impersonation-actions";

/** Shown on every page while a platform admin is logged in as someone else. */
export async function ImpersonationBanner({ name, email }: { name: string; email: string }) {
  const t = await getTranslations("impersonation");
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm md:px-6">
      <p className="flex items-center gap-2">
        <UserRoundIcon className="size-4 shrink-0" aria-hidden />
        <span>{t.rich("banner", { name, email, b: (c) => <strong className="font-semibold">{c}</strong> })}</span>
      </p>
      <form action={stopImpersonationAction}>
        <Button type="submit" size="sm" variant="outline" className="bg-background">
          <UndoIcon />
          {t("return")}
        </Button>
      </form>
    </div>
  );
}
