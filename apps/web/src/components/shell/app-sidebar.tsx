"use client";

import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import type { Role } from "@stagedesk/core";
import { switchOrganization } from "@/app/[locale]/app/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { Viewer } from "@/lib/viewer";
import { Logo } from "@/components/brand/logo";
import { UserMenu } from "./user-menu";

export type ShellViewer = Pick<Viewer, "user" | "organization" | "memberships" | "permissions"> & { role: Role };

export function AppSidebar({ viewer }: { viewer: ShellViewer }) {
  const t = useTranslations();
  const groups = navigationFor(viewer.permissions, viewer.role);
  const footer = footerNavigationFor(viewer.permissions);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href="/app" className="flex h-11 items-center px-2" aria-label="StageDesk Pro">
          <Logo onDark className="h-8 group-data-[collapsible=icon]:hidden" priority />
          <Logo variant="mark" className="hidden size-8 group-data-[collapsible=icon]:block" />
        </Link>
        <WorkspaceSwitcher viewer={viewer} />
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
        <div data-tour="account">
          <UserMenu viewer={viewer} />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function WorkspaceMark({ name, logo }: { name: string; logo?: string | null }) {
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element -- uploaded logos are served from /files
    return <img src={logo} alt="" className="size-8 shrink-0 rounded-lg bg-white object-contain" />;
  }
  return (
    <span className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function WorkspaceSwitcher({ viewer }: { viewer: ShellViewer }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const name = viewer.organization?.name ?? t("shell.platform");
  const label = (
    <>
      <WorkspaceMark name={name} logo={viewer.organization?.logo} />
      <span className="grid flex-1 text-left leading-tight">
        <span className="truncate font-semibold">{name}</span>
        <span className="truncate text-xs text-sidebar-foreground/70">{t(`roles.${viewer.role}`)}</span>
      </span>
    </>
  );

  if (viewer.memberships.length < 2) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" asChild>
            <Link href="/app">{label}</Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  function choose(organizationId: string) {
    startTransition(async () => {
      await switchOrganization(organizationId);
      router.push("/app");
      router.refresh();
    });
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" disabled={pending} className="data-[state=open]:bg-sidebar-accent">
              {label}
              <ChevronsUpDownIcon className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-60">
            <DropdownMenuLabel className="text-xs text-muted-foreground">{t("shell.switchAgency")}</DropdownMenuLabel>
            {viewer.memberships.map((m) => (
              <DropdownMenuItem key={m.id} onSelect={() => choose(m.id)}>
                <WorkspaceMark name={m.name} logo={m.logo} />
                <span className="grid flex-1 leading-tight">
                  <span className="truncate">{m.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{t(`roles.${m.role}`)}</span>
                </span>
                {m.id === viewer.organization?.id && <CheckIcon />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
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
              <Link href={item.href} data-tour={`nav-${item.key}`}>
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
