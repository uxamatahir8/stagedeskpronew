"use client";

import { SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { Role } from "@stagedesk/core";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { footerNavigationFor, navigationFor } from "@/config/navigation";
import { useRouter } from "@/i18n/navigation";

/** Ctrl+K / ⌘K page search over everything the current role can open. */
export function CommandMenu({ role }: { role: Role }) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const groups = navigationFor(role);
  const footer = footerNavigationFor(role);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <Button
        variant="outline"
        className="h-8 w-full justify-start gap-2 text-muted-foreground sm:w-56"
        onClick={() => setOpen(true)}
      >
        <SearchIcon />
        <span className="flex-1 text-left">{t("shell.search")}</span>
        <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">Ctrl K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title={t("shell.search")} description={t("shell.searchPlaceholder")}>
        {/* This shadcn version expects the <Command> root inside the dialog. */}
        <Command>
          <CommandInput placeholder={t("shell.searchPlaceholder")} />
          <CommandList>
            <CommandEmpty>{t("shell.noResults")}</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.key} heading={t(`navGroups.${group.key}`)}>
                {group.items.map((item) => (
                  <CommandItem key={item.key} onSelect={() => go(item.href)}>
                    <item.icon />
                    {t(`nav.${item.key}`)}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            <CommandGroup>
              {footer.map((item) => (
                <CommandItem key={item.key} onSelect={() => go(item.href)}>
                  <item.icon />
                  {t(`nav.${item.key}`)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
