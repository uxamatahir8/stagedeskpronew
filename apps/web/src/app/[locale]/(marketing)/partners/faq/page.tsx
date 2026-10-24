import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FaqList } from "@/components/site/marketing-blocks";
import { PartnersNav } from "@/components/site/partners-nav";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/partners/faq">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "partnerPages" });
  return pageMetadata({ locale, title: t("faqMeta"), description: t("faqMetaDescription"), paths: { nl: "/partners/faq", en: "/partners/faq" }, kicker: t("faqEyebrow") });
}

export default async function PartnersFaqPage({ params }: PageProps<"/[locale]/partners/faq">) {
  setRequestLocale((await params).locale as Locale);
  const t = await getTranslations("partnerPages");
  const items = ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const).map((i) => ({ q: t(`faq${i}Q`), a: t(`faq${i}A`) }));
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-12 sm:px-6 sm:py-16">
      <PartnersNav current="faq" />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <header className="grid content-start gap-4">
          <p className="text-sm font-medium text-primary">{t("faqEyebrow")}</p>
          <h1 className="text-4xl font-bold tracking-tight text-balance">{t("faqTitle")}</h1>
          <p className="text-muted-foreground">{t("applyHint")}</p>
          <Button asChild className="w-fit">
            <Link href="/partners#apply">{t("apply")}</Link>
          </Button>
        </header>
        <FaqList items={items} />
      </div>
    </main>
  );
}
