import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { legalPageSlugs, prisma } from "@stagedesk/db";
import { AuthCard } from "@/components/auth/auth-card";
import { SignedInRedirect } from "@/components/auth/signed-in-redirect";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { siteSettings } from "@/lib/site";
import { SignUpForm } from "./sign-up-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/sign-up">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "auth.signUp" });
  return { title: t("title") };
}

export default async function SignUpPage({ params, searchParams }: PageProps<"/[locale]/sign-up">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <>
      <SignedInRedirect />
      <Suspense fallback={<Skeleton className="h-96 w-full max-w-md" />}>
        <SignUp searchParams={searchParams} />
      </Suspense>
    </>
  );
}

/**
 * Before launch (waitlist mode) the public can't create accounts; only people
 * with an open invitation can. Better Auth enforces the same on the server.
 */
async function SignUp({ searchParams }: Pick<PageProps<"/[locale]/sign-up">, "searchParams">) {
  await connection();
  const [{ site }, t, query] = await Promise.all([siteSettings(), getTranslations("auth.signUp"), searchParams]);
  const invited = typeof query["email"] === "string" ? query["email"].trim().toLowerCase() : "";
  const invitation =
    site.waitlistMode && invited
      ? await prisma.invitation.findFirst({ where: { email: invited, status: "pending", expiresAt: { gt: new Date() } }, select: { id: true } })
      : null;

  if (site.waitlistMode && !invitation) {
    return (
      <AuthCard title={t("waitlistTitle")} description={t("waitlistBody")}>
        <div className="grid gap-4">
          <Button asChild>
            <Link href="/#waitlist">{t("waitlistButton")}</Link>
          </Button>
          <p className="text-sm text-muted-foreground">
            {t("haveAccount")}{" "}
            <Link href="/sign-in" className="font-medium text-primary underline-offset-4 hover:underline">
              {t("signInLink")}
            </Link>
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t("title")}
      description={t("subtitle")}
      footer={
        <>
          {t("haveAccount")}{" "}
          <Link href="/sign-in" className="font-medium text-primary underline-offset-4 hover:underline">
            {t("signInLink")}
          </Link>
        </>
      }
    >
      <SignUpForm />
      <TermsNotice />
    </AuthCard>
  );
}

/** Links to the current Terms and Privacy policy; acceptance itself is recorded after the first sign-in. */
async function TermsNotice() {
  const [t, locale, terms, privacy] = await Promise.all([getTranslations("auth.signUp"), getLocale(), legalPageSlugs("terms"), legalPageSlugs("privacy")]);
  if (!terms || !privacy) return null;
  const href = (p: { slugNl: string; slugEn: string }) => `/${locale === "en" ? p.slugEn : p.slugNl}`;
  return (
    <p className="mt-4 text-xs text-muted-foreground">
      {t.rich("termsNotice", {
        terms: (chunks) => (
          <Link href={href(terms)} target="_blank" className="underline underline-offset-4 hover:text-foreground">
            {chunks}
          </Link>
        ),
        privacy: (chunks) => (
          <Link href={href(privacy)} target="_blank" className="underline underline-offset-4 hover:text-foreground">
            {chunks}
          </Link>
        ),
      })}
    </p>
  );
}
