import { setRequestLocale } from "next-intl/server";
import { GroupMessages } from "@/components/group-messages";
import type { Locale } from "@/i18n/routing";

/** Public booking pages, quote links and the embeddable form: only their own messages go to the browser. */
export default async function PublicLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return (
    <GroupMessages group="public" locale={locale}>
      {children}
    </GroupMessages>
  );
}
