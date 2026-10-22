"use client";

import { useTranslations } from "next-intl";
import type { Role } from "@stagedesk/core";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { footerNavigationFor, navigationFor, type NavItem } from "@/config/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import { UserMenu } from "./user-menu";

const platformRoles: Role[] = ["platform_admin", "affiliate"];

export function AppSidebar({ role }: { role: Role }) {
  const t = useTranslations();
  const groups = navigationFor(role);
  const footer = footerNavigationFor(role);
  const workspace = platformRoles.includes(role) ? t("shell.demoPlatform") : t("shell.demoAgency");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/app">
                <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
                  S
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">{workspace}</span>
                  <span className="truncate text-xs text-sidebar-foreground/70">{t(`roles.${role}`)}</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.key}>
            {group.key !== "overview" && <SidebarGroupLabel>{t(`navGroups.${group.key}`)}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <NavMenu items={group.items} />
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <NavMenu items={footer} />
        <UserMenu role={role} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function NavMenu({ items }: { items: NavItem[] }) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <SidebarMenu>
      {items.map((item) => {
        const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
        return (
          <SidebarMenuItem key={item.key}>
            <SidebarMenuButton asChild isActive={active} tooltip={t(item.key)}>
              <Link href={item.href}>
                <item.icon />
                <span>{t(item.key)}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
