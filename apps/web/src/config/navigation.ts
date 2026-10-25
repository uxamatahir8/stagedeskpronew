import {
  BadgePercentIcon,
  BanknoteIcon,
  BellIcon,
  BuildingIcon,
  CalendarCheckIcon,
  CalendarDaysIcon,
  ClipboardListIcon,
  ContactIcon,
  CreditCardIcon,
  FileTextIcon,
  GiftIcon,
  GlobeIcon,
  HandCoinsIcon,
  HouseIcon,
  LayersIcon,
  LifeBuoyIcon,
  LinkIcon,
  InboxIcon,
  SparklesIcon,
  type LucideIcon,
  MailIcon,
  NewspaperIcon,
  MessagesSquareIcon,
  Music2Icon,
  PanelsTopLeftIcon,
  PartyPopperIcon,
  ReceiptIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  StarIcon,
  TagIcon,
  TypeIcon,
  UserRoundIcon,
  UsersIcon,
  WalletIcon,
  ScrollTextIcon,
  UsersRoundIcon,
  MailPlusIcon,
} from "lucide-react";
import type { Permission } from "@stagedesk/core";
import type { Messages } from "next-intl";

export type NavKey = keyof Messages["nav"];
export type NavGroupKey = keyof Messages["navGroups"];

export interface NavItem {
  key: NavKey;
  /** Path below the locale prefix, e.g. "/app/bookings". */
  href: string;
  icon: LucideIcon;
  /** Omit for pages every signed-in role sees. */
  permission?: Permission;
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
      { key: "adminBookings", href: "/app/admin-bookings", icon: CalendarCheckIcon, permission: "platform.agencies" },
      { key: "leads", href: "/app/leads", icon: InboxIcon, permission: "platform.agencies" },
      { key: "plans", href: "/app/plans", icon: LayersIcon, permission: "platform.plans" },
      { key: "platformPayments", href: "/app/platform-payments", icon: BanknoteIcon, permission: "platform.payments" },
      { key: "affiliates", href: "/app/affiliates", icon: BadgePercentIcon, permission: "platform.affiliates" },
      { key: "pages", href: "/app/pages", icon: FileTextIcon, permission: "platform.pages" },
      { key: "content", href: "/app/content", icon: NewspaperIcon, permission: "platform.pages" },
      { key: "texts", href: "/app/texts", icon: TypeIcon, permission: "platform.pages" },
      { key: "newsletter", href: "/app/newsletter", icon: MailPlusIcon, permission: "platform.newsletter" },
      { key: "emails", href: "/app/emails", icon: MailIcon, permission: "platform.settings" },
      { key: "users", href: "/app/users", icon: UsersRoundIcon, permission: "platform.users" },
      { key: "audit", href: "/app/audit", icon: ScrollTextIcon, permission: "platform.audit" },
      { key: "settings", href: "/app/settings", icon: SlidersHorizontalIcon, permission: "platform.settings" },
      { key: "paymentSetup", href: "/app/settings/payments", icon: CreditCardIcon, permission: "platform.settings" },
    ],
  },
  {
    key: "agency",
    items: [
      { key: "bookings", href: "/app/bookings", icon: CalendarCheckIcon, permission: "agency.bookings" },
      { key: "leadOffers", href: "/app/lead-offers", icon: SparklesIcon, permission: "agency.leads" },
      { key: "quotes", href: "/app/quotes", icon: ReceiptIcon, permission: "agency.quotes" },
      { key: "calendar", href: "/app/calendar", icon: CalendarDaysIcon, permission: "agency.calendar" },
      { key: "artists", href: "/app/artists", icon: Music2Icon, permission: "agency.artists" },
      { key: "customers", href: "/app/customers", icon: ContactIcon, permission: "agency.customers" },
      { key: "services", href: "/app/services", icon: TagIcon, permission: "agency.services" },
      { key: "reviews", href: "/app/reviews", icon: StarIcon, permission: "agency.reviews" },
      { key: "agencyPayments", href: "/app/payments", icon: WalletIcon, permission: "agency.payments" },
    ],
  },
  {
    key: "artist",
    items: [
      { key: "gigs", href: "/app/gigs", icon: ClipboardListIcon, permission: "artist.gigs" },
      { key: "availability", href: "/app/availability", icon: CalendarDaysIcon, permission: "artist.availability" },
      { key: "earnings", href: "/app/earnings", icon: HandCoinsIcon, permission: "artist.earnings" },
    ],
  },
  {
    key: "customer",
    items: [
      { key: "event", href: "/app/event", icon: PartyPopperIcon, permission: "customer.event" },
      { key: "customerPayments", href: "/app/my-payments", icon: CreditCardIcon, permission: "customer.payments" },
    ],
  },
  {
    key: "affiliate",
    items: [
      { key: "links", href: "/app/links", icon: LinkIcon, permission: "affiliate.links" },
      { key: "payouts", href: "/app/payouts", icon: HandCoinsIcon, permission: "affiliate.payouts" },
    ],
  },
  {
    key: "manage",
    items: [
      { key: "messages", href: "/app/messages", icon: MessagesSquareIcon, permission: "messages" },
      { key: "team", href: "/app/team", icon: UsersIcon, permission: "agency.team" },
      { key: "referrals", href: "/app/referrals", icon: GiftIcon, permission: "agency.referrals" },
      { key: "agencySettings", href: "/app/agency-settings", icon: SettingsIcon, permission: "agency.settings" },
      { key: "bookingPage", href: "/app/booking-page", icon: GlobeIcon, permission: "agency.website" },
      { key: "website", href: "/app/website", icon: PanelsTopLeftIcon, permission: "agency.website" },
      { key: "billing", href: "/app/billing", icon: CreditCardIcon, permission: "agency.billing" },
    ],
  },
];

/** Shown at the bottom of the sidebar for everyone. */
export const footerNavigation: NavItem[] = [
  { key: "support", href: "/app/support", icon: LifeBuoyIcon, permission: "support" },
];

const isDev = process.env.NODE_ENV !== "production";

function allowed(item: NavItem, permissions: readonly Permission[]) {
  if (item.devOnly && !isDev) return false;
  return item.permission === undefined || permissions.includes(item.permission);
}

export function navigationFor(permissions: readonly Permission[]): NavGroup[] {
  return navigation
    .map((group) => ({ ...group, items: group.items.filter((item) => allowed(item, permissions)) }))
    .filter((group) => group.items.length > 0);
}

export function footerNavigationFor(permissions: readonly Permission[]): NavItem[] {
  return footerNavigation.filter((item) => allowed(item, permissions));
}

/** Pages reached from menus other than the sidebar; listed for breadcrumbs. */
const otherPages: NavItem[] = [
  { key: "profile", href: "/app/profile", icon: UserRoundIcon },
  { key: "notifications", href: "/app/notifications", icon: BellIcon },
];

/** Finds the nav item for a path like "/app/bookings". */
/** The item for a path, or for its closest parent section (so detail pages keep their section). */
export function findNavItem(path: string): NavItem | undefined {
  const items = [...navigation.flatMap((g) => g.items), ...footerNavigation, ...otherPages];
  return (
    items.find((item) => item.href === path) ??
    items.filter((item) => item.href !== "/app" && path.startsWith(`${item.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]
  );
}
