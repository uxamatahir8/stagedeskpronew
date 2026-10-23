import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { legalPageSlugs } from "@stagedesk/db";
import { AuthCard } from "@/components/auth/auth-card";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { SignUpForm } from "./sign-up-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/sign-up">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "auth.signUp" });
  return { title: t("title") };
}

export default async function SignUpPage({ params }: PageProps<"/[locale]/sign-up">) {
  setRequestLocale((await params).locale as Locale);
  const t = await getTranslations("auth.signUp");

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
      <Suspense>
        <SignUpForm />
      </Suspense>
      <Suspense fallback={null}>
        <TermsNotice />
      </Suspense>
    </AuthCard>
  );
}

/** Links to the current Terms and Privacy policy; acceptance itself is recorded after the first sign-in. */
async function TermsNotice() {
  await connection();
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
