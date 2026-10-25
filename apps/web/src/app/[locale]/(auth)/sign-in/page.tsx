import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { siteSettings } from "@/lib/site";
import { SignInForm } from "./sign-in-form";
import { SignedInRedirect } from "@/components/auth/signed-in-redirect";

export async function generateMetadata({ params }: PageProps<"/[locale]/sign-in">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "auth.signIn" });
  return { title: t("title") };
}

export default async function SignInPage({ params }: PageProps<"/[locale]/sign-in">) {
  setRequestLocale((await params).locale as Locale);
  const [t, tu, { site }] = await Promise.all([getTranslations("auth.signIn"), getTranslations("auth.signUp"), siteSettings()]);

  return (
    <>
      <SignedInRedirect />
      <AuthCard
      title={t("title")}
      description={t("subtitle")}
      footer={
        <>
          {t("noAccount")}{" "}
          {/* Before launch new people join the waitlist instead of signing up. */}
          <Link href={site.waitlistMode ? "/#waitlist" : "/sign-up"} className="font-medium text-primary underline-offset-4 hover:underline">
            {site.waitlistMode ? tu("waitlistButton") : t("signUpLink")}
          </Link>
        </>
      }
    >
      <Suspense>
        <SignInForm />
      </Suspense>
      </AuthCard>
    </>
  );
}
