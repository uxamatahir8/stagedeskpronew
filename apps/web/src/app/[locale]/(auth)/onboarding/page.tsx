import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Skeleton } from "@/components/ui/skeleton";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getViewer } from "@/lib/viewer";
import { OnboardingForm } from "./onboarding-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/onboarding">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "onboarding" });
  return { title: t("title") };
}

export default async function OnboardingPage({ params }: PageProps<"/[locale]/onboarding">) {
  setRequestLocale((await params).locale as Locale);
  const t = await getTranslations("onboarding");

  return (
    <AuthCard title={t("title")} description={t("body")}>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <Onboarding />
      </Suspense>
    </AuthCard>
  );
}

async function Onboarding() {
  const viewer = await getViewer();
  const locale = (await getLocale()) as Locale;
  if (!viewer) redirect({ href: "/sign-in?next=/onboarding", locale });
  if (viewer!.role) redirect({ href: "/app", locale });
  const t = await getTranslations("onboarding");

  return (
    <div className="grid gap-6">
      <OnboardingForm />
      <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
        {t("signedInAs", { email: viewer!.user.email })}
        <SignOutButton variant="link" className="h-auto p-0">
          {t("signOut")}
        </SignOutButton>
      </p>
    </div>
  );
}
