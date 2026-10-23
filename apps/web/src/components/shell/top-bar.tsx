"use client";

import { useTranslations } from "next-intl";
import type { Role } from "@stagedesk/core";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { findNavItem } from "@/config/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import { CommandMenu } from "./command-menu";
import { NotificationBell } from "./notification-bell";

export function TopBar({ role }: { role: Role }) {
  const t = useTranslations();
  const pathname = usePathname();
  const current = pathname === "/app" ? undefined : findNavItem(pathname);

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-brand-gradient" />
      <SidebarTrigger className="-ml-1" aria-label={t("shell.toggleSidebar")} />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      <Breadcrumb className="hidden md:block">
        <BreadcrumbList>
          <BreadcrumbItem>
            {current ? (
              <BreadcrumbLink asChild>
                <Link href="/app">{t("nav.home")}</Link>
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage>{t("nav.home")}</BreadcrumbPage>
            )}
          </BreadcrumbItem>
          {current && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {current.href === pathname ? (
                  <BreadcrumbPage>{t(`nav.${current.key}`)}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={current.href}>{t(`nav.${current.key}`)}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-2">
        <CommandMenu role={role} />
        <NotificationBell />
      </div>
    </header>
  );
}
