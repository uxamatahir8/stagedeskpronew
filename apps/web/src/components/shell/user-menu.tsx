"use client";

import { ChevronsUpDownIcon, CompassIcon, LanguagesIcon, LogOutIcon, MonitorIcon, MoonIcon, SunIcon, UserRoundIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { authClient } from "@/lib/auth-client";
import { stopImpersonationAction } from "@/lib/impersonation-actions";
import { rememberLocale } from "@/lib/remember-locale";
import type { ShellViewer } from "./app-sidebar";


export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function UserMenu({ viewer }: { viewer: ShellViewer }) {
  const t = useTranslations();
  const { isMobile } = useSidebar();
  const { theme, setTheme } = useTheme();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  function changeLocale(next: string) {
    rememberLocale(next);
    startTransition(() => router.replace(pathname, { locale: next as (typeof routing.locales)[number] }));
  }

  async function signOut() {
    // Logged in as someone else: "sign out" returns the admin to their own account.
    if (viewer.impersonatedBy) return stopImpersonationAction();
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg">{initials(viewer.user.name)}</AvatarFallback>
              </Avatar>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate font-medium">{viewer.user.name}</span>
                <span className="truncate text-xs text-sidebar-foreground/70">{viewer.user.email}</span>
              </span>
              <ChevronsUpDownIcon className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="font-normal">
              <div className="font-medium">{viewer.user.name}</div>
              <div className="text-xs text-muted-foreground">{viewer.user.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/app/profile">
                <UserRoundIcon />
                {t("shell.profile")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => window.dispatchEvent(new CustomEvent("stagedesk:tour"))}>
              <CompassIcon />
              {t("guides.takeTour")}
            </DropdownMenuItem>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <SunIcon />
                {t("shell.theme")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                  <DropdownMenuRadioItem value="light">
                    <SunIcon />
                    {t("shell.themeLight")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <MoonIcon />
                    {t("shell.themeDark")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">
                    <MonitorIcon />
                    {t("shell.themeSystem")}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <LanguagesIcon />
                {t("shell.language")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={locale} onValueChange={changeLocale}>
                  {routing.locales.map((code) => (
                    <DropdownMenuRadioItem key={code} value={code}>
                      {t(`languages.${code}`)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={signOut}>
              <LogOutIcon />
              {viewer.impersonatedBy ? t("impersonation.return") : t("shell.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
