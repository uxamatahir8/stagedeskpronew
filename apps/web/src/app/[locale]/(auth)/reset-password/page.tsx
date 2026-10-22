import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import type { Locale } from "@/i18n/routing";
import { ResetPasswordForm } from "./reset-password-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/reset-password">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "auth.reset" });
  return { title: t("title") };
}

export default async function ResetPasswordPage({ params }: PageProps<"/[locale]/reset-password">) {
  setRequestLocale((await params).locale as Locale);
  const t = await getTranslations("auth.reset");

  return (
    <AuthCard title={t("title")}>
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
