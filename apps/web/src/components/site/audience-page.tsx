import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { PageIntro } from "./page-intro";

/**
 * A page for one audience (agencies or artists): the problems they know,
 * how StageDesk handles each, and one next step.
 */
export async function AudiencePage({ namespace, cta }: { namespace: "forAgencies" | "forArtists"; cta: { href: string; label: string } }) {
  const t = await getTranslations(namespace);
  const items = ["1", "2", "3", "4"] as const;
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-16 px-4 py-16 sm:px-6 sm:py-20">
      <PageIntro eyebrow={t("eyebrow")} title={t("title")} intro={t("intro")}>
        <Button asChild size="lg" className="w-fit">
          <Link href={cta.href}>
            {cta.label}
            <ArrowRightIcon />
          </Link>
        </Button>
      </PageIntro>
      <div className="grid gap-6 md:grid-cols-2">
        {items.map((i) => (
          <section key={i} className="grid content-start gap-3 rounded-2xl border bg-card p-6">
            <p className="text-sm text-muted-foreground line-through decoration-muted-foreground/40">{t(`pain${i}`)}</p>
            <h2 className="flex gap-2 text-lg font-semibold">
              <CheckIcon className="mt-1 size-5 shrink-0 text-success" aria-hidden />
              {t(`fix${i}`)}
            </h2>
            <p className="text-muted-foreground">{t(`fix${i}Body`)}</p>
          </section>
        ))}
      </div>
      <section className="grid gap-4 rounded-3xl bg-muted/40 p-8 sm:p-10">
        <h2 className="text-2xl font-bold tracking-tight">{t("closingTitle")}</h2>
        <p className="max-w-2xl text-muted-foreground">{t("closingBody")}</p>
        <Button asChild variant="outline" className="w-fit">
          <Link href={t("closingHref")}>{t("closingLink")}</Link>
        </Button>
      </section>
    </main>
  );
}
