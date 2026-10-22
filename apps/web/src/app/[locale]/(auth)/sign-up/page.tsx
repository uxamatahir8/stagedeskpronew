import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
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
    </AuthCard>
  );
}
