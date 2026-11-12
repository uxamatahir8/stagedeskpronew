import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { SignedInRedirect } from "@/components/auth/signed-in-redirect";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { resetTokenUsable } from "@/lib/password-setup";
import { ResetPasswordForm } from "./reset-password-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/reset-password">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "auth.reset" });
  return { title: t("title"), robots: { index: false } };
}

export default async function ResetPasswordPage({ params, searchParams }: PageProps<"/[locale]/reset-password">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full max-w-sm" />}>
      <Reset searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Both a forgotten-password reset and the first password of an account that
 * was created for someone (`setup=1`). The token is checked before the form
 * shows, so a used or expired link offers a new one straight away.
 */
async function Reset({ searchParams }: Pick<PageProps<"/[locale]/reset-password">, "searchParams">) {
  await connection();
  const query = await searchParams;
  const token = typeof query["token"] === "string" ? query["token"] : null;
  const setup = query["setup"] === "1";
  const t = await getTranslations("auth.reset");
  const usable = token !== null && (await resetTokenUsable(token));

  return (
    <>
      {/* Without a link this page has nothing for a signed-in visitor. With one it stays: the link
          may be for another account (an admin opening a setup link they just sent, a shared computer). */}
      {!token && <SignedInRedirect />}
      <AuthCard title={setup ? t("setupTitle") : t("title")} description={setup && usable ? t("setupBody") : undefined}>
        <ResetPasswordForm token={usable ? token : null} setup={setup} />
      </AuthCard>
    </>
  );
}
