import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const pages = [
  { key: "overview", href: "/partners" },
  { key: "how", href: "/partners/how-it-works" },
  { key: "earnings", href: "/partners/earnings" },
  { key: "faq", href: "/partners/faq" },
] as const;

/** The partner program's own menu, the same on each of its pages. */
export async function PartnersNav({ current }: { current: (typeof pages)[number]["key"] }) {
  const t = await getTranslations("partnerPages");
  return (
    <nav aria-label={t("howEyebrow")} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
      <ul className="flex flex-wrap gap-1 text-sm">
        {pages.map((p) => (
          <li key={p.key}>
            <Link
              href={p.href}
              aria-current={current === p.key ? "page" : undefined}
              className={cn("rounded-full px-3.5 py-1.5", current === p.key ? "bg-foreground font-medium text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
            >
              {t(`nav_${p.key}`)}
            </Link>
          </li>
        ))}
      </ul>
      {current !== "overview" && (
        <Button asChild size="sm">
          <Link href="/partners#apply">{t("apply")}</Link>
        </Button>
      )}
    </nav>
  );
}
