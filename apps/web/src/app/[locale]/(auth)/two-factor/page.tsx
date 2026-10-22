import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import type { Locale } from "@/i18n/routing";
import { TwoFactorForm } from "./two-factor-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/two-factor">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "auth.twoFactor" });
  return { title: t("title") };
}

export default async function TwoFactorPage({ params }: PageProps<"/[locale]/two-factor">) {
  setRequestLocale((await params).locale as Locale);
  const t = await getTranslations("auth.twoFactor");

  return (
    <AuthCard title={t("title")} description={t("body")}>
      <Suspense>
        <TwoFactorForm />
      </Suspense>
    </AuthCard>
  );
}
