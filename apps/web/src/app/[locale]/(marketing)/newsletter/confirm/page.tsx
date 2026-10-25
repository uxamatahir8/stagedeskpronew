import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { confirmNewsletter } from "@stagedesk/db";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { NewsletterCard } from "../newsletter-card";

export async function generateMetadata({ params }: PageProps<"/[locale]/newsletter/confirm">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "newsletter" });
  return { title: t("confirmedTitle"), robots: { index: false } };
}

export default async function ConfirmPage({ params, searchParams }: PageProps<"/[locale]/newsletter/confirm">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="mx-auto my-20 h-48 w-full max-w-xl" />}>
      <Confirm searchParams={searchParams} />
    </Suspense>
  );
}

/** The link in the confirmation email: confirms on arrival (clicking it again is harmless). */
async function Confirm({ searchParams }: Pick<PageProps<"/[locale]/newsletter/confirm">, "searchParams">) {
  await connection();
  const [t, query] = await Promise.all([getTranslations("newsletter"), searchParams]);
  const token = typeof query["token"] === "string" ? query["token"] : "";
  const subscriber = token ? await confirmNewsletter(token) : null;
  return (
    <NewsletterCard tone={subscriber ? "success" : "error"} title={subscriber ? t("confirmedTitle") : t("invalidLinkTitle")}>
      <p className="text-muted-foreground">{subscriber ? t("confirmedBody") : t("invalidLinkBody")}</p>
      <Button asChild className="w-fit">
        <Link href="/blog">{t("toWebsite")}</Link>
      </Button>
    </NewsletterCard>
  );
}
