import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import { agencyPermissions, defaultAgencyGrants, isRole, roleGrants, sanitizeRolePermissions } from "@stagedesk/core";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { requireAgency, viewerCan } from "@/lib/viewer";
import { PermissionsEditor } from "./permissions-editor";
import { InviteDialog, TeamTables } from "./team-manager";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/team">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "team" });
  return { title: t("title") };
}

export default async function TeamPage({ params, searchParams }: PageProps<"/[locale]/app/team">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Team searchParams={searchParams} />
    </Suspense>
  );
}

async function Team({ searchParams }: Pick<PageProps<"/[locale]/app/team">, "searchParams">) {
  const { viewer, organization, db } = await requireAgency("agency.team");
  const canPermissions = viewerCan(viewer, "agency.permissions");
  const tab = (await searchParams)["tab"] === "roles" && canPermissions ? "roles" : "members";
  const manage = viewerCan(viewer, "agency.team.manage");
  const [t, tp, format, members, invitations] = await Promise.all([
    getTranslations("team"),
    getTranslations("permissions"),
    getFormatter(),
    db.member.findMany({
      where: { role: { not: "customer" } },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.invitation.findMany({ where: { status: "pending", expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
  ]);

  const date = (d: Date) => format.dateTime(d, { day: "numeric", month: "short", year: "numeric" });
  const custom = organization.rolePermissions;
  // What admins and staff have now: the owner's choices plus defaults for permissions added since (shown so saving keeps them).
  const grants = {
    agency_admin: roleGrants("agency_admin", custom),
    agency_staff: roleGrants("agency_staff", custom),
  } as Parameters<typeof PermissionsEditor>[0]["initial"];
  const unseen = custom ? agencyPermissions.filter((perm) => !(custom.known ?? []).includes(perm) && perm.startsWith("agency.inventory")).length > 0 : false;

  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} actions={tab === "members" && manage ? <InviteDialog /> : undefined} />
      {canPermissions && (
        <nav className="flex w-fit gap-1 rounded-lg bg-muted p-1 text-sm" aria-label={t("title")}>
          {(["members", "roles"] as const).map((x) => (
            <Link
              key={x}
              href={x === "members" ? "/app/team" : "/app/team?tab=roles"}
              aria-current={x === tab ? "page" : undefined}
              className={cn("rounded-md px-3 py-1.5", x === tab ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {tp(`tab_${x}`)}
            </Link>
          ))}
        </nav>
      )}
      {tab === "roles" ? (
        <PermissionsEditor
          initial={sanitizeRolePermissions(grants) as typeof grants}
          defaults={{ agency_admin: [...defaultAgencyGrants.agency_admin], agency_staff: [...defaultAgencyGrants.agency_staff] }}
          custom={Boolean(custom)}
          unseen={unseen}
        />
      ) : (
        <TeamTables
          manage={manage}
          viewerRole={viewer.role}
          viewerUserId={viewer.user.id}
          members={members
            .filter((m) => isRole(m.role))
            .map((m) => ({ id: m.id, userId: m.userId, name: m.user.name, email: m.user.email, role: m.role, joined: date(m.createdAt), joinedAt: m.createdAt.getTime() }))}
          invitations={invitations.map((i) => ({ id: i.id, email: i.email, role: i.role ?? "", expires: date(i.expiresAt) }))}
        />
      )}
    </div>
  );
}
