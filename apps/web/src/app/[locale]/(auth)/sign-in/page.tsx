import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { SignInForm } from "./sign-in-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/sign-in">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "auth.signIn" });
  return { title: t("title") };
}

export default async function SignInPage({ params }: PageProps<"/[locale]/sign-in">) {
  setRequestLocale((await params).locale as Locale);
  const t = await getTranslations("auth.signIn");

  return (
    <AuthCard
      title={t("title")}
      description={t("subtitle")}
      footer={
        <>
          {t("noAccount")}{" "}
          <Link href="/sign-up" className="font-medium text-primary underline-offset-4 hover:underline">
            {t("signUpLink")}
          </Link>
        </>
      }
    >
      <Suspense>
        <SignInForm />
      </Suspense>
    </AuthCard>
  );
}
