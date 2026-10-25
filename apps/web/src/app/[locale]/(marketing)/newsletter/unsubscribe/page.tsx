import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@stagedesk/db";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { NewsletterCard } from "../newsletter-card";
import { UnsubscribeButton } from "./unsubscribe-button";

export async function generateMetadata({ params }: PageProps<"/[locale]/newsletter/unsubscribe">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "newsletter" });
  return { title: t("unsubscribeTitle"), robots: { index: false } };
}

export default async function UnsubscribePage({ params, searchParams }: PageProps<"/[locale]/newsletter/unsubscribe">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="mx-auto my-20 h-48 w-full max-w-xl" />}>
      <Unsubscribe searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Asks for one click instead of unsubscribing on arrival: mail scanners open
 * links, and shouldn't take people off the list. Mail apps use the one-click
 * POST endpoint (/api/newsletter/unsubscribe) instead.
 */
async function Unsubscribe({ searchParams }: Pick<PageProps<"/[locale]/newsletter/unsubscribe">, "searchParams">) {
  await connection();
  const [t, query] = await Promise.all([getTranslations("newsletter"), searchParams]);
  const token = typeof query["token"] === "string" ? query["token"] : "";
  const subscriber = token ? await prisma.newsletterSubscriber.findUnique({ where: { token }, select: { email: true, status: true } }) : null;
  if (!subscriber) {
    return (
      <NewsletterCard tone="error" title={t("invalidLinkTitle")}>
        <p className="text-muted-foreground">{t("invalidLinkBody")}</p>
      </NewsletterCard>
    );
  }
  if (subscriber.status === "unsubscribed" || query["done"] === "1") {
    return (
      <NewsletterCard tone="success" title={t("unsubscribedTitle")}>
        <p className="text-muted-foreground">{t("unsubscribedBody")}</p>
        <Button asChild variant="outline" className="w-fit">
          <Link href="/">{t("toWebsite")}</Link>
        </Button>
      </NewsletterCard>
    );
  }
  return (
    <NewsletterCard tone="neutral" title={t("unsubscribeTitle")}>
      <p className="text-muted-foreground">{t("unsubscribeBody", { email: subscriber.email })}</p>
      <UnsubscribeButton token={token} />
    </NewsletterCard>
  );
}
