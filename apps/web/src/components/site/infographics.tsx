import {
  BadgeCheckIcon,
  BriefcaseIcon,
  CakeIcon,
  CheckIcon,
  CreditCardIcon,
  FileTextIcon,
  GlobeIcon,
  HandCoinsIcon,
  HeartIcon,
  InboxIcon,
  type LucideIcon,
  Music2Icon,
  PartyPopperIcon,
  ServerIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TentIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/** Payment and trust facts that are true of the platform today. */
export async function TrustStrip() {
  const t = await getTranslations("infographics");
  const items: { icon: LucideIcon; label: string }[] = [
    { icon: CreditCardIcon, label: t("trustStripe") },
    { icon: BadgeCheckIcon, label: t("trustIdeal") },
    { icon: ServerIcon, label: t("trustEu") },
    { icon: ShieldCheckIcon, label: t("trustGdpr") },
    { icon: GlobeIcon, label: t("trustLanguages") },
  ];
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
      {items.map(({ icon: Icon, label }) => (
        <li key={label} className="flex items-center gap-2">
          <Icon className="size-4 text-primary" aria-hidden />
          {label}
        </li>
      ))}
    </ul>
  );
}

/** From first inquiry to payout: the five stages every booking goes through. */
export async function JourneyFlow() {
  const t = await getTranslations("infographics");
  const stages: { key: "inquiry" | "quote" | "booked" | "event" | "payout"; icon: LucideIcon; tone: string }[] = [
    { key: "inquiry", icon: InboxIcon, tone: "from-primary to-primary/70" },
    { key: "quote", icon: FileTextIcon, tone: "from-primary/90 to-magenta/70" },
    { key: "booked", icon: Music2Icon, tone: "from-primary/70 to-magenta/90" },
    { key: "event", icon: PartyPopperIcon, tone: "from-magenta/80 to-magenta" },
    { key: "payout", icon: HandCoinsIcon, tone: "from-magenta to-magenta/80" },
  ];
  return (
    <figure className="grid gap-8" aria-labelledby="journey-title">
      <figcaption className="grid max-w-2xl gap-3">
        <p className="text-sm font-medium text-magenta">{t("journeyEyebrow")}</p>
        <h2 id="journey-title" className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          {t("journeyTitle")}
        </h2>
        <p className="text-lg text-muted-foreground">{t("journeyIntro")}</p>
      </figcaption>
      <ol className="relative grid gap-6 md:grid-cols-5 md:gap-4">
        <div aria-hidden className="absolute top-8 right-[10%] left-[10%] hidden h-1 rounded-full bg-brand-gradient opacity-30 md:block" />
        {stages.map(({ key, icon: Icon, tone }, i) => (
          <li key={key} className="relative grid grid-cols-[4rem_1fr] items-start gap-4 md:grid-cols-1 md:justify-items-center md:text-center">
            <span className={cn("relative flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg shadow-primary/20", tone)}>
              <Icon className="size-7" aria-hidden />
              <span className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full border-2 border-background bg-foreground text-[11px] font-bold text-background tabular-nums">{i + 1}</span>
            </span>
            <span className="grid gap-1">
              <span className="font-semibold">{t(`stage_${key}`)}</span>
              <span className="text-sm text-muted-foreground">{t(`stage_${key}Body`)}</span>
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

/** Everyone around one booking, and what each of them does in StageDesk. */
export async function HubDiagram() {
  const t = await getTranslations("infographics");
  const nodes: { key: "agency" | "customer" | "artist" | "partner"; icon: LucideIcon; position: string }[] = [
    { key: "agency", icon: BriefcaseIcon, position: "md:col-start-1 md:row-start-1" },
    { key: "customer", icon: HeartIcon, position: "md:col-start-3 md:row-start-1" },
    { key: "artist", icon: Music2Icon, position: "md:col-start-1 md:row-start-3" },
    { key: "partner", icon: UsersIcon, position: "md:col-start-3 md:row-start-3" },
  ];
  return (
    <figure className="grid gap-10" aria-labelledby="hub-title">
      <figcaption className="mx-auto grid max-w-2xl gap-3 text-center">
        <p className="text-sm font-medium text-magenta">{t("hubEyebrow")}</p>
        <h2 id="hub-title" className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          {t("hubTitle")}
        </h2>
        <p className="text-lg text-muted-foreground">{t("hubIntro")}</p>
      </figcaption>
      <div className="relative grid gap-4 md:grid-cols-[1fr_auto_1fr] md:grid-rows-[auto_auto_auto] md:items-center md:gap-x-10 md:gap-y-6">
        {/* Connector lines behind the cards (desktop only). */}
        <svg aria-hidden className="pointer-events-none absolute inset-0 hidden size-full md:block" preserveAspectRatio="none" viewBox="0 0 100 100">
          <defs>
            <linearGradient id="hub-line" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--primary)" />
              <stop offset="100%" stopColor="var(--magenta)" />
            </linearGradient>
          </defs>
          {[
            [25, 18],
            [75, 18],
            [25, 82],
            [75, 82],
          ].map(([x, y]) => (
            <line key={`${x}-${y}`} x1="50" y1="50" x2={x} y2={y} stroke="url(#hub-line)" strokeWidth="0.4" strokeDasharray="1.2 1.2" opacity="0.7" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {nodes.map(({ key, icon: Icon, position }) => (
          <div key={key} className={cn("relative grid gap-2 rounded-2xl border bg-card/95 p-5 shadow-sm backdrop-blur", position)}>
            <span className="flex items-center gap-2 font-semibold">
              <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-magenta/15 text-primary">
                <Icon className="size-4" aria-hidden />
              </span>
              {t(`hub_${key}`)}
            </span>
            <p className="text-sm text-muted-foreground">{t(`hub_${key}Body`)}</p>
          </div>
        ))}
        <div className="relative mx-auto grid size-40 place-items-center rounded-full bg-brand-gradient p-1 shadow-2xl shadow-magenta/25 md:col-start-2 md:row-start-2">
          <div className="grid size-full place-items-center rounded-full bg-card">
            <Logo variant="mark" className="size-16" />
          </div>
        </div>
      </div>
    </figure>
  );
}

/** How the same week looks without and with StageDesk. */
export async function BeforeAfter() {
  const t = await getTranslations("infographics");
  const rows = ["1", "2", "3", "4", "5"] as const;
  return (
    <div className="grid gap-8">
      <div className="mx-auto grid max-w-2xl gap-3 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{t("compareTitle")}</h2>
        <p className="text-lg text-muted-foreground">{t("compareIntro")}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid content-start gap-3 rounded-2xl border bg-card p-6">
          <h3 className="font-semibold text-muted-foreground">{t("without")}</h3>
          <ul className="grid gap-3">
            {rows.map((r) => (
              <li key={r} className="flex gap-3 text-sm text-muted-foreground">
                <XIcon className="mt-0.5 size-4 shrink-0 text-destructive/70" aria-hidden />
                {t(`before${r}`)}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative grid content-start gap-3 overflow-hidden rounded-2xl border border-primary/30 bg-card p-6 shadow-lg shadow-primary/10">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-brand-gradient" />
          <h3 className="font-semibold text-primary">{t("with")}</h3>
          <ul className="grid gap-3">
            {rows.map((r) => (
              <li key={r} className="flex gap-3 text-sm">
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                {t(`after${r}`)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Product facts as big figures (capabilities, not customer metrics). */
export async function CapabilityFigures() {
  const t = await getTranslations("infographics");
  const figures = ["roles", "languages", "vat", "page"] as const;
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {figures.map((f, i) => (
        <div key={f} className="relative grid gap-1 overflow-hidden rounded-2xl border bg-card p-6">
          <div aria-hidden className={cn("pointer-events-none absolute -top-12 -right-12 size-36 rounded-full blur-2xl", i % 2 ? "bg-magenta/15" : "bg-primary/15")} />
          <dd className="relative text-4xl font-bold tracking-tight text-brand-gradient tabular-nums">{t(`figure_${f}`)}</dd>
          <dt className="relative font-medium">{t(`figure_${f}Label`)}</dt>
          <dd className="relative text-sm text-muted-foreground">{t(`figure_${f}Body`)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The kinds of events agencies book with StageDesk. */
export async function EventTypes() {
  const [t, te] = await Promise.all([getTranslations("infographics"), getTranslations("eventTypes")]);
  const types: { key: "wedding" | "corporate" | "birthday" | "party" | "festival"; icon: LucideIcon }[] = [
    { key: "wedding", icon: HeartIcon },
    { key: "corporate", icon: BriefcaseIcon },
    { key: "birthday", icon: CakeIcon },
    { key: "party", icon: SparklesIcon },
    { key: "festival", icon: TentIcon },
  ];
  return (
    <div className="grid gap-6">
      <h2 className="text-center text-2xl font-bold tracking-tight">{t("eventsTitle")}</h2>
      <ul className="flex flex-wrap justify-center gap-3">
        {types.map(({ key, icon: Icon }) => (
          <li key={key} className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-medium shadow-sm">
            <Icon className="size-4 text-magenta" aria-hidden />
            {te(key)}
          </li>
        ))}
      </ul>
    </div>
  );
}
