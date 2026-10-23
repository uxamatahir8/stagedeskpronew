import { getTranslations, setRequestLocale } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

export default async function AuthLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("auth");

  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-brand-gradient p-10 text-primary-foreground lg:flex">
        <Link href="/" className="w-fit" aria-label="StageDesk Pro">
          <Logo onDark className="h-12" priority />
        </Link>
        <p className="max-w-sm text-2xl leading-snug font-medium text-balance">{t("brandLine")}</p>
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full border-[48px] border-primary-foreground/10"
        />
      </aside>
      <main className="flex flex-col items-center justify-center px-4 py-12">
        <Link href="/" className="mb-10 lg:hidden" aria-label="StageDesk Pro">
          <Logo className="h-10" />
        </Link>
        {children}
      </main>
    </div>
  );
}
