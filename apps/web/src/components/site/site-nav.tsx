"use client";

import {
  CheckIcon,
  BookOpenIcon,
  CalendarCheckIcon,
  ChevronDownIcon,
  FileTextIcon,
  GlobeIcon,
  HandCoinsIcon,
  HandshakeIcon,
  HeartIcon,
  LayoutGridIcon,
  LifeBuoyIcon,
  type LucideIcon,
  MailIcon,
  MenuIcon,
  Music2Icon,
  SparklesIcon,
  UsersIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/** Icons by name: server components pass the name, not the component. */
const icons = {
  grid: LayoutGridIcon,
  globe: GlobeIcon,
  file: FileTextIcon,
  coins: HandCoinsIcon,
  music: Music2Icon,
  users: UsersIcon,
  heart: HeartIcon,
  calendar: CalendarCheckIcon,
  book: BookOpenIcon,
  help: LifeBuoyIcon,
  sparkles: SparklesIcon,
  handshake: HandshakeIcon,
  mail: MailIcon,
} satisfies Record<string, LucideIcon>;
export type NavIcon = keyof typeof icons;

export interface NavLink {
  href: string;
  label: string;
  description?: string;
  icon?: NavIcon;
}
export type NavEntry = NavLink | { label: string; children: NavLink[] };

const isGroup = (e: NavEntry): e is { label: string; children: NavLink[] } => "children" in e;

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

/** A menu that opens on hover (and on click or keyboard), listing pages with a short description. */
function NavGroup({ label, items }: { label: string; items: NavLink[] }) {
  const active = useActive();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hold = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const release = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };
  const current = items.some((i) => active(i.href));
  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger
        onPointerEnter={hold}
        onPointerLeave={release}
        className={cn(
          "flex items-center gap-1 rounded-md px-3 py-2 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:text-foreground",
          current && "font-medium text-foreground",
        )}
      >
        {label}
        <ChevronDownIcon className="size-3.5 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} onPointerEnter={hold} onPointerLeave={release} className="w-[22rem] p-2">
        {items.map((item) => {
          const Icon = item.icon ? icons[item.icon] : null;
          return (
            <DropdownMenuItem key={item.href} asChild className="items-start gap-3 rounded-lg p-2.5">
              <Link href={item.href} aria-current={active(item.href) ? "page" : undefined}>
                {Icon && (
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/12 to-magenta/12 text-primary">
                    <Icon className="size-4" aria-hidden />
                  </span>
                )}
                <span className="grid gap-0.5">
                  <span className="font-medium">{item.label}</span>
                  {item.description && <span className="text-xs leading-snug text-muted-foreground">{item.description}</span>}
                </span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Desktop navigation: plain links and dropdown groups, with the current section marked. */
export function NavLinks({ entries }: { entries: NavEntry[] }) {
  const active = useActive();
  return (
    <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Main">
      {entries.map((e) =>
        isGroup(e) ? (
          <NavGroup key={e.label} label={e.label} items={e.children} />
        ) : (
          <Link
            key={e.href}
            href={e.href}
            aria-current={active(e.href) ? "page" : undefined}
            className={cn("rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground", active(e.href) && "font-medium text-foreground")}
          >
            {e.label}
          </Link>
        ),
      )}
    </nav>
  );
}

/** Switches language on the same page. Builder pages redirect to their slug in the other language. */
const languageCodes = ["nl", "en"] as const;

/** Shows the language the page is in; the menu switches to the other one on the same page. */
export function LocaleSwitch() {
  const t = useTranslations("site");
  const tl = useTranslations("languages");
  const languages = languageCodes.map((code) => ({ code, label: tl(code) }));
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const current = languages.find((l) => l.code === locale) ?? languages[0];
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="px-1.5 sm:px-2.5" disabled={pending} aria-label={t("languageCurrent", { language: current.label })}>
          <GlobeIcon className="hidden sm:block" />
          {current.code.toUpperCase()}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {languages.map((l) => (
          <DropdownMenuItem
            key={l.code}
            lang={l.code}
            onSelect={() => l.code !== locale && startTransition(() => router.replace(pathname, { locale: l.code as (typeof routing.locales)[number] }))}
          >
            {l.label}
            {l.code === locale && <CheckIcon className="ml-auto" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The menu on phones and small tablets: groups become headed sections. */
export function MobileNav({ entries, signIn, cta }: { entries: NavEntry[]; signIn: string | null; cta: NavLink }) {
  const t = useTranslations("site");
  const [open, setOpen] = useState(false);
  const linkClass = "rounded-md px-3 py-2 hover:bg-accent";
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label={t("openMenu")}>
          <MenuIcon />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[min(20rem,100vw)] max-w-full overflow-x-hidden overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            <Logo className="h-9 w-auto" />
          </SheetTitle>
        </SheetHeader>
        <nav className="grid gap-1 px-4 pb-6" aria-label="Main">
          {entries.map((e) =>
            isGroup(e) ? (
              <div key={e.label} className="grid gap-1 pt-2">
                <span className="px-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{e.label}</span>
                {e.children.map((c) => (
                  <Link key={c.href} href={c.href} onClick={() => setOpen(false)} className={linkClass}>
                    {c.label}
                  </Link>
                ))}
              </div>
            ) : (
              <Link key={e.href} href={e.href} onClick={() => setOpen(false)} className={linkClass}>
                {e.label}
              </Link>
            ),
          )}
          <div className="mt-4 grid gap-2 border-t pt-4">
            {signIn && (
              <Button asChild variant="outline">
                <Link href="/sign-in" onClick={() => setOpen(false)}>
                  {signIn}
                </Link>
              </Button>
            )}
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
