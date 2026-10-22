import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { isRole } from "@stagedesk/core";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { requireAgency } from "@/lib/viewer";
import { InviteDialog, TeamTables } from "./team-manager";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/team">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "team" });
  return { title: t("title") };
}

export default async function TeamPage({ params }: PageProps<"/[locale]/app/team">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Team />
    </Suspense>
  );
}

async function Team() {
  const { viewer, organization, db } = await requireAgency("agency.team");
  const [t, format, members, invitations] = await Promise.all([
    getTranslations("team"),
    getFormatter(),
    db.member.findMany({
      where: { role: { not: "customer" } },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.invitation.findMany({ where: { status: "pending", expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
  ]);

  const date = (d: Date) => format.dateTime(d, { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="grid gap-8">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={<InviteDialog organizationId={organization.id} />}
      />
      <TeamTables
        organizationId={organization.id}
        viewerRole={viewer.role}
        viewerUserId={viewer.user.id}
        members={members
          .filter((m) => isRole(m.role))
          .map((m) => ({ id: m.id, userId: m.userId, name: m.user.name, email: m.user.email, role: m.role, joined: date(m.createdAt) }))}
        invitations={invitations.map((i) => ({ id: i.id, email: i.email, role: i.role ?? "", expires: date(i.expiresAt) }))}
      />
    </div>
  );
}
