"use client";

import { BellIcon } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { findNavItem } from "@/config/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import { CommandMenu } from "./command-menu";
import { RoleSwitcher } from "./role-switcher";

export function TopBar({ role }: { role: Role }) {
  const t = useTranslations();
  const pathname = usePathname();
  const current = pathname === "/app" ? undefined : findNavItem(pathname);

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur">
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
                <BreadcrumbPage>{t(`nav.${current.key}`)}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-2">
        <CommandMenu role={role} />
        {process.env.NODE_ENV !== "production" && <RoleSwitcher role={role} />}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t("shell.notifications")}>
              <BellIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>{t("shell.notifications")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t("shell.noNotifications")}</p>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
