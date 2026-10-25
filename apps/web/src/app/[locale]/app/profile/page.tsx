import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { resolveDatePrefs } from "@stagedesk/core";
import { newsletterStatusForEmail, prisma } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { platformDatePrefs } from "@/lib/date-prefs";
import { requireViewer } from "@/lib/viewer";
import { DatePrefsCard } from "./date-prefs-card";
import { NewsletterCard } from "./newsletter-card";
import { DetailsForm, PasswordForm, TwoFactorCard } from "./profile-forms";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/profile">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "profile" });
  return { title: t("title") };
}

export default async function ProfilePage({ params }: PageProps<"/[locale]/app/profile">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-[36rem] w-full" />}>
      <Profile />
    </Suspense>
  );
}

async function Profile() {
  const viewer = await requireViewer();
  const t = await getTranslations("profile");
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: viewer.user.id },
    select: { name: true, email: true, phone: true, locale: true, twoFactorEnabled: true, timeZone: true, dateFormat: true, timeFormat: true },
  });
  const [platform, agency] = await Promise.all([
    platformDatePrefs(),
    viewer.organization ? prisma.organization.findUnique({ where: { id: viewer.organization.id }, select: { timeZone: true, dateFormat: true, timeFormat: true } }) : null,
  ]);
  const newsletter = await newsletterStatusForEmail(user.email);

  return (
    <div className="grid max-w-3xl gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      <DetailsForm values={{ name: user.name, email: user.email, phone: user.phone ?? "", locale: user.locale === "en" ? "en" : "nl" }} />
      <DatePrefsCard
        initial={{ timeZone: user.timeZone ?? "", dateFormat: user.dateFormat ?? "", timeFormat: user.timeFormat ?? "" }}
        inherited={resolveDatePrefs(agency, platform)}
      />
      <PasswordForm />
      <TwoFactorCard enabled={Boolean(user.twoFactorEnabled)} />
      <NewsletterCard subscribed={newsletter === "subscribed"} />
    </div>
  );
}
