import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { ForgotPasswordForm } from "./forgot-password-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/forgot-password">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "auth.forgot" });
  return { title: t("title") };
}

export default async function ForgotPasswordPage({ params }: PageProps<"/[locale]/forgot-password">) {
  setRequestLocale((await params).locale as Locale);
  const t = await getTranslations("auth.forgot");

  return (
    <AuthCard
      title={t("title")}
      description={t("body")}
      footer={
        <Link href="/sign-in" className="font-medium text-primary underline-offset-4 hover:underline">
          {t("back")}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
