import { LifeBuoyIcon, MailIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageIntro } from "@/components/site/page-intro";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import { siteSettings } from "@/lib/site";
import { turnstileSiteKey } from "@/lib/turnstile";
import { ContactForm } from "./contact-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/contact">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "contactPage" });
  return pageMetadata({ locale, title: t("title"), description: t("intro"), paths: { nl: "/contact", en: "/contact" } });
}

export default async function ContactPage({ params }: PageProps<"/[locale]/contact">) {
  setRequestLocale((await params).locale as Locale);
  const t = await getTranslations("contactPage");
  return (
    <main className="mx-auto grid w-full max-w-[88rem] gap-12 px-5 py-16 sm:px-8 lg:px-12 sm:py-20">
      <PageIntro title={t("title")} intro={t("intro")} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardContent>
            <ContactForm turnstileKey={turnstileSiteKey()} />
          </CardContent>
        </Card>
        <div className="grid content-start gap-6">
          <section className="grid gap-2">
            <h2 className="flex items-center gap-2 font-semibold">
              <LifeBuoyIcon className="size-4 text-primary" aria-hidden />
              {t("helpTitle")}
            </h2>
            <p className="text-muted-foreground">{t("helpBody")}</p>
            <Link href="/help" className="w-fit font-medium text-primary underline-offset-4 hover:underline">
              {t("helpLink")}
            </Link>
          </section>
          <Suspense fallback={<Skeleton className="h-16 w-full" />}>
            <EmailUs />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

async function EmailUs() {
  await connection();
  const [t, { site }] = await Promise.all([getTranslations("contactPage"), siteSettings()]);
  return (
    <section className="grid gap-2">
      <h2 className="flex items-center gap-2 font-semibold">
        <MailIcon className="size-4 text-primary" aria-hidden />
        {t("emailTitle")}
      </h2>
      <p className="text-muted-foreground">
        {t("emailBody")}{" "}
        <a href={`mailto:${site.supportEmail}`} className="font-medium text-primary underline-offset-4 hover:underline">
          {site.supportEmail}
        </a>
      </p>
    </section>
  );
}
