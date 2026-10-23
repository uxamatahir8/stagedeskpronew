"use client";

import { GlobeIcon, MenuIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export interface NavLink {
  href: string;
  label: string;
}

/** Desktop links with the current page marked. */
export function NavLinks({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
      {links.map((l) => {
        const active = pathname === l.href || (l.href !== "/" && pathname.startsWith(`${l.href}/`));
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn("rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground", active && "font-medium text-foreground")}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Switches language on the same page. Builder pages redirect to their slug in the other language. */
export function LocaleSwitch() {
  const t = useTranslations("site");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const next = locale === "nl" ? "en" : "nl";
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-label={t("switchLanguage")}
      onClick={() => startTransition(() => router.replace(pathname, { locale: next as (typeof routing.locales)[number] }))}
    >
      <GlobeIcon />
      {next.toUpperCase()}
    </Button>
  );
}

/** The menu on phones and small tablets. */
export function MobileNav({ links, signIn, cta }: { links: NavLink[]; signIn: string; cta: NavLink }) {
  const t = useTranslations("site");
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("openMenu")}>
          <MenuIcon />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72">
        <SheetHeader>
          <SheetTitle>StageDesk</SheetTitle>
        </SheetHeader>
        <nav className="grid gap-1 px-4" aria-label="Main">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-md px-3 py-2 hover:bg-accent">
              {l.label}
            </Link>
          ))}
          <div className="mt-4 grid gap-2 border-t pt-4">
            <Button asChild variant="outline">
              <Link href="/sign-in" onClick={() => setOpen(false)}>
                {signIn}
              </Link>
            </Button>
            <Button asChild>
              <Link href={cta.href} onClick={() => setOpen(false)}>
                {cta.label}
              </Link>
            </Button>
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
