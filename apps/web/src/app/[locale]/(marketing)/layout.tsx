import { setRequestLocale } from "next-intl/server";
import { GroupMessages } from "@/components/group-messages";
import { SiteFooter, SiteHeader } from "@/components/site/site-chrome";
import type { Locale } from "@/i18n/routing";

/** The public website: header, page (each page renders its own <main>), footer. */
export default async function MarketingLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return (
    <GroupMessages group="marketing" locale={locale}>
      <div className="site-motion flex min-h-svh min-w-0 flex-col overflow-x-clip bg-background">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </div>
    </GroupMessages>
  );
}
