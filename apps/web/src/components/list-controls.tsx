import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** A row of filter links; the active one is filled. Each option carries its own href. */
export function FilterChips({ label, options }: { label: string; options: { key: string; label: string; href: string; active: boolean }[] }) {
  return (
    <nav className="flex flex-wrap gap-1.5" aria-label={label}>
      {options.map((o) => (
        <Link
          key={o.key}
          href={o.href}
          aria-current={o.active ? "page" : undefined}
          className={cn(
            "rounded-full border px-3 py-1 text-sm transition-colors",
            o.active ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:border-primary/40 hover:text-foreground",
          )}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

/** Previous / next links with "page x of y". Hidden when everything fits on one page. */
export async function Pager({ page, pages, total, href }: { page: number; pages: number; total: number; href: (page: number) => string }) {
  if (pages <= 1) return null;
  const t = await getTranslations("list");
  return (
    <nav className="flex items-center justify-between gap-3 text-sm" aria-label={t("pagination")}>
      <span className="text-muted-foreground">{t("pageOf", { page, pages, total })}</span>
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm" className={cn(page <= 1 && "pointer-events-none opacity-50")}>
          <Link href={href(page - 1)} aria-disabled={page <= 1}>
            <ChevronLeftIcon />
            {t("previous")}
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm" className={cn(page >= pages && "pointer-events-none opacity-50")}>
          <Link href={href(page + 1)} aria-disabled={page >= pages}>
            {t("next")}
            <ChevronRightIcon />
          </Link>
        </Button>
      </div>
    </nav>
  );
}
