import {
  BadgePercentIcon,
  BanknoteIcon,
  BuildingIcon,
  CalendarCheckIcon,
  CalendarDaysIcon,
  ClipboardListIcon,
  ContactIcon,
  CreditCardIcon,
  FileTextIcon,
  HandCoinsIcon,
  HouseIcon,
  LayersIcon,
  LifeBuoyIcon,
  LinkIcon,
  type LucideIcon,
  MessagesSquareIcon,
  Music2Icon,
  PaletteIcon,
  PartyPopperIcon,
  ReceiptIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  StarIcon,
  TagIcon,
  UserRoundIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import { can, type Permission, type Role } from "@stagedesk/core";
import type { Messages } from "next-intl";

export type NavKey = keyof Messages["nav"];
export type NavGroupKey = keyof Messages["navGroups"];
export type Phase = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface NavItem {
  key: NavKey;
  /** Path below the locale prefix, e.g. "/app/bookings". */
  href: string;
  icon: LucideIcon;
  /** Omit for pages every signed-in role sees. */
  permission?: Permission;
  /** Plan phase that builds the page; pages without a phase exist already. */
  phase?: Phase;
  /** Only listed while developing. */
  devOnly?: boolean;
}

export interface NavGroup {
  key: NavGroupKey;
  items: NavItem[];
}

export const navigation: NavGroup[] = [
  {
    key: "overview",
    items: [{ key: "home", href: "/app", icon: HouseIcon }],
  },
  {
    key: "platform",
    items: [
      { key: "agencies", href: "/app/agencies", icon: BuildingIcon, permission: "platform.agencies" },
      { key: "plans", href: "/app/plans", icon: LayersIcon, permission: "platform.plans", phase: 5 },
      { key: "platformPayments", href: "/app/platform-payments", icon: BanknoteIcon, permission: "platform.payments", phase: 5 },
      { key: "affiliates", href: "/app/affiliates", icon: BadgePercentIcon, permission: "platform.affiliates", phase: 6 },
      { key: "pages", href: "/app/pages", icon: FileTextIcon, permission: "platform.pages", phase: 8 },
      { key: "settings", href: "/app/settings", icon: SlidersHorizontalIcon, permission: "platform.settings", phase: 5 },
    ],
  },
  {
    key: "agency",
    items: [
      { key: "bookings", href: "/app/bookings", icon: CalendarCheckIcon, permission: "agency.bookings" },
      { key: "quotes", href: "/app/quotes", icon: ReceiptIcon, permission: "agency.quotes" },
      { key: "calendar", href: "/app/calendar", icon: CalendarDaysIcon, permission: "agency.calendar" },
      { key: "artists", href: "/app/artists", icon: Music2Icon, permission: "agency.artists" },
      { key: "customers", href: "/app/customers", icon: ContactIcon, permission: "agency.customers" },
      { key: "services", href: "/app/services", icon: TagIcon, permission: "agency.quotes" },
      { key: "reviews", href: "/app/reviews", icon: StarIcon, permission: "agency.bookings" },
      { key: "agencyPayments", href: "/app/payments", icon: WalletIcon, permission: "agency.payments", phase: 5 },
    ],
  },
  {
    key: "artist",
    items: [
      { key: "gigs", href: "/app/gigs", icon: ClipboardListIcon, permission: "artist.gigs" },
      { key: "availability", href: "/app/availability", icon: CalendarDaysIcon, permission: "artist.availability" },
      { key: "earnings", href: "/app/earnings", icon: HandCoinsIcon, permission: "artist.earnings", phase: 5 },
    ],
  },
  {
    key: "customer",
    items: [
      { key: "event", href: "/app/event", icon: PartyPopperIcon, permission: "customer.event" },
      { key: "customerPayments", href: "/app/my-payments", icon: CreditCardIcon, permission: "customer.payments", phase: 5 },
    ],
  },
  {
    key: "affiliate",
    items: [
      { key: "links", href: "/app/links", icon: LinkIcon, permission: "affiliate.links", phase: 6 },
      { key: "payouts", href: "/app/payouts", icon: HandCoinsIcon, permission: "affiliate.payouts", phase: 6 },
    ],
  },
  {
    key: "manage",
    items: [
      { key: "messages", href: "/app/messages", icon: MessagesSquareIcon, permission: "messages", phase: 7 },
      { key: "team", href: "/app/team", icon: UsersIcon, permission: "agency.team" },
      { key: "agencySettings", href: "/app/agency-settings", icon: SettingsIcon, permission: "agency.settings" },
      { key: "billing", href: "/app/billing", icon: CreditCardIcon, permission: "agency.billing", phase: 5 },
    ],
  },
];

/** Shown at the bottom of the sidebar for everyone. */
export const footerNavigation: NavItem[] = [
  { key: "support", href: "/app/support", icon: LifeBuoyIcon, permission: "support", phase: 7 },
  { key: "designSystem", href: "/app/ui", icon: PaletteIcon, devOnly: true },
];

const isDev = process.env.NODE_ENV !== "production";

function allowed(item: NavItem, role: Role) {
  if (item.devOnly && !isDev) return false;
  return item.permission === undefined || can(role, item.permission);
}

export function navigationFor(role: Role): NavGroup[] {
  return navigation
    .map((group) => ({ ...group, items: group.items.filter((item) => allowed(item, role)) }))
    .filter((group) => group.items.length > 0);
}

export function footerNavigationFor(role: Role): NavItem[] {
  return footerNavigation.filter((item) => allowed(item, role));
}

/** Pages reached from menus other than the sidebar; listed for breadcrumbs. */
const otherPages: NavItem[] = [{ key: "profile", href: "/app/profile", icon: UserRoundIcon }];

/** Finds the nav item for a path like "/app/bookings". */
export function findNavItem(path: string): NavItem | undefined {
  return [...navigation.flatMap((g) => g.items), ...footerNavigation, ...otherPages].find((item) => item.href === path);
}
