import { Suspense } from "react";
import { getLocale, setRequestLocale } from "next-intl/server";
import { can } from "@stagedesk/core";
import { pendingLegal, prisma } from "@stagedesk/db";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { SubscriptionBanner } from "@/components/shell/subscription-banner";
import { SuspendedNotice } from "@/components/shell/suspended-notice";
import { TopBar } from "@/components/shell/top-bar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireViewer } from "@/lib/viewer";

export default async function DashboardLayout({ children, params }: LayoutProps<"/[locale]/app">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const { user, role, organization, memberships } = await requireViewer();
  // New Terms (or, for agencies, a new data processing agreement) are accepted before anything else.
  if ((await pendingLegal(user.id)).length > 0) redirect({ href: "/accept-terms", locale: (await getLocale()) as Locale });
  // A suspended agency is closed to its team and customers; they can still switch agency or sign out.
  const suspended = organization ? await prisma.organization.findUnique({ where: { id: organization.id }, select: { suspendedAt: true, suspendReason: true } }) : null;
  return (
    <SidebarProvider>
      <AppSidebar viewer={{ user, role, organization, memberships }} />
      <SidebarInset>
        <TopBar role={role} />
        {organization && can(role, "agency.bookings") && !suspended?.suspendedAt && <SubscriptionBanner organizationId={organization.id} role={role} />}
        <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6 md:py-8">
          {suspended?.suspendedAt ? <SuspendedNotice agency={organization!.name} reason={suspended.suspendReason} /> : children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-svh">
      <div className="hidden w-64 border-r bg-sidebar p-3 md:block">
        <Skeleton className="h-12 w-full" />
        <div className="mt-6 grid gap-2">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
      <div className="flex-1">
        <div className="h-14 border-b" />
        <div className="mx-auto grid max-w-7xl gap-4 p-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-28 w-full" />
        </div>
      </div>
    </div>
  );
}
