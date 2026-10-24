import { ArrowRightIcon, Building2Icon, MailOpenIcon, UserRoundIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@stagedesk/db";
import { AuthCard } from "@/components/auth/auth-card";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getViewer } from "@/lib/viewer";
import { OnboardingForm } from "./onboarding-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/onboarding">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "onboarding" });
  return { title: t("title") };
}

export default async function OnboardingPage({ params, searchParams }: PageProps<"/[locale]/onboarding">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full max-w-md" />}>
      <Onboarding searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * For someone signed in without a role. Starting an agency is a choice, not
 * the default: customers and artists get access through their agency, and an
 * open invitation is offered first.
 */
async function Onboarding({ searchParams }: Pick<PageProps<"/[locale]/onboarding">, "searchParams">) {
  const viewer = await getViewer();
  const locale = (await getLocale()) as Locale;
  if (!viewer) redirect({ href: "/sign-in?next=/onboarding", locale });
  if (viewer!.role) redirect({ href: "/app", locale });
  const t = await getTranslations("onboarding");
  const startAgency = (await searchParams)["start"] === "agency";
  const invitations = await prisma.invitation.findMany({
    where: { email: viewer!.user.email.toLowerCase(), status: "pending", expiresAt: { gt: new Date() } },
    include: { organization: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  const footer = (
    <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
      {t("signedInAs", { email: viewer!.user.email })}
      <SignOutButton variant="link" className="h-auto p-0">
        {t("signOut")}
      </SignOutButton>
    </p>
  );

  if (startAgency) {
    return (
      <AuthCard title={t("title")} description={t("body")}>
        <div className="grid gap-6">
          <OnboardingForm />
          {footer}
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("chooseTitle")} description={t("chooseBody")}>
      <div className="grid gap-4">
        {invitations.map((i) => (
          <Link key={i.id} href={`/invite/${i.id}`} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4 hover:border-primary">
            <MailOpenIcon className="size-5 text-primary" aria-hidden />
            <span className="grid">
              <span className="font-medium">{t("invitationTitle", { agency: i.organization.name })}</span>
              <span className="text-sm text-muted-foreground">{t("invitationBody")}</span>
            </span>
            <ArrowRightIcon className="size-4 text-primary" aria-hidden />
          </Link>
        ))}
        <div className="grid grid-cols-[2.5rem_1fr] gap-3 rounded-xl border p-4">
          <Building2Icon className="mt-0.5 size-5 text-primary" aria-hidden />
          <div className="grid gap-2">
            <span className="font-medium">{t("agencyTitle")}</span>
            <span className="text-sm text-muted-foreground">{t("agencyBody")}</span>
            <Button asChild size="sm" className="w-fit">
              <Link href="/onboarding?start=agency">{t("agencyButton")}</Link>
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-[2.5rem_1fr] gap-3 rounded-xl border p-4">
          <UserRoundIcon className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
          <div className="grid gap-1">
            <span className="font-medium">{t("otherTitle")}</span>
            <span className="text-sm text-muted-foreground">{t("otherBody")}</span>
          </div>
        </div>
        {footer}
      </div>
    </AuthCard>
  );
}
