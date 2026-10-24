import { BookOpenIcon, CalendarCheckIcon, CreditCardIcon, GlobeIcon, MailIcon, MusicIcon, RocketIcon, UserCogIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

// Icons for the starter categories; categories added later get the book.
export const helpIcons: Record<string, typeof BookOpenIcon> = {
  "aan-de-slag": RocketIcon,
  boekingen: CalendarCheckIcon,
  betalingen: CreditCardIcon,
  artiesten: MusicIcon,
  website: GlobeIcon,
  account: UserCogIcon,
};

/** The way out of the help centre: ask us. */
export async function ContactBand() {
  const t = await getTranslations("help");
  return (
    <section className="grid gap-4 rounded-2xl border bg-muted/40 p-8 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="grid gap-1">
        <h2 className="text-xl font-semibold">{t("notFound")}</h2>
        <p className="text-muted-foreground">{t("contactBody")}</p>
      </div>
      <Button asChild size="lg">
        <Link href="/contact">
          <MailIcon className="size-4" aria-hidden />
          {t("contactUs")}
        </Link>
      </Button>
    </section>
  );
}
