import { CalendarIcon, CheckIcon, MapPinIcon, Music2Icon, UsersIcon, XIcon } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

/**
 * Stylised product illustrations built from real UI pieces (not screenshots),
 * so they stay sharp, follow the theme and translate. All figures are
 * example data and the frame says so.
 */
function Frame({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <figure className={cn("relative rounded-2xl border bg-card p-4 shadow-xl shadow-primary/5", className)}>
      <div aria-hidden className="pointer-events-none absolute -inset-px -z-10 rounded-2xl bg-brand-gradient opacity-20 blur-2xl" />
      <figcaption className="mb-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-destructive/60" aria-hidden />
          <span className="size-2 rounded-full bg-warning/80" aria-hidden />
          <span className="size-2 rounded-full bg-success/70" aria-hidden />
          <span className="ml-2 font-medium text-foreground">{title}</span>
        </span>
        <ExampleTag />
      </figcaption>
      {children}
    </figure>
  );
}

async function ExampleTag() {
  const t = await getTranslations("mock");
  return <span className="rounded-full bg-muted px-2 py-0.5">{t("example")}</span>;
}

export async function MockQuote() {
  const [t, format] = await Promise.all([getTranslations("mock"), getFormatter()]);
  const money = (cents: number) => format.number(cents / 100, { style: "currency", currency: "EUR" });
  const lines = [
    { label: t("quoteLine1"), qty: "5 ×", cents: 62_500 },
    { label: t("quoteLine2"), qty: "1 ×", cents: 22_500 },
    { label: t("quoteLine3"), qty: "1 ×", cents: 4_500 },
  ];
  const subtotal = lines.reduce((s, l) => s + l.cents, 0);
  const vat = Math.round(subtotal * 0.21);
  return (
    <Frame title={t("quoteTitle")}>
      <div className="grid gap-3 text-sm">
        <div className="flex items-baseline justify-between">
          <span className="font-semibold">{t("quoteFor")}</span>
          <span className="text-xs text-muted-foreground">v2 · {t("validUntil")}</span>
        </div>
        <ul className="divide-y rounded-lg border">
          {lines.map((l) => (
            <li key={l.label} className="flex items-center justify-between gap-2 px-3 py-2">
              <span>
                <span className="text-muted-foreground tabular-nums">{l.qty}</span> {l.label}
              </span>
              <span className="tabular-nums">{money(l.cents)}</span>
            </li>
          ))}
        </ul>
        <dl className="grid gap-1 text-xs">
          <div className="flex justify-between text-muted-foreground">
            <dt>{t("vat")}</dt>
            <dd className="tabular-nums">{money(vat)}</dd>
          </div>
          <div className="flex justify-between text-base font-semibold">
            <dt>{t("total")}</dt>
            <dd className="tabular-nums">{money(subtotal + vat)}</dd>
          </div>
        </dl>
        <div className="flex items-center justify-between gap-2 rounded-lg bg-brand-gradient px-3 py-2 text-white">
          <span className="text-xs">{t("deposit", { amount: money(Math.round((subtotal + vat) * 0.3)) })}</span>
          <span className="rounded-md bg-white/20 px-2 py-0.5 text-xs font-medium">{t("accept")}</span>
        </div>
      </div>
    </Frame>
  );
}

export async function MockBookingForm() {
  const t = await getTranslations("mock");
  const types = [t("typeWedding"), t("typeCorporate"), t("typeBirthday"), t("typeFestival")];
  return (
    <Frame title={t("formTitle")}>
      <div className="grid gap-3 text-sm">
        <div className="flex flex-wrap gap-1.5">
          {types.map((type, i) => (
            <span key={type} className={cn("rounded-full border px-2.5 py-1 text-xs", i === 0 ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground")}>
              {type}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: CalendarIcon, label: t("formDate") },
            { icon: UsersIcon, label: t("formGuests") },
            { icon: MapPinIcon, label: t("formVenue") },
            { icon: Music2Icon, label: t("formGenre") },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs">
              <Icon className="size-3.5 text-primary" aria-hidden />
              {label}
            </div>
          ))}
        </div>
        <div className="rounded-lg border px-2.5 py-2 text-xs text-muted-foreground">{t("formMessage")}</div>
        <div className="rounded-lg bg-brand-gradient py-2 text-center text-xs font-medium text-white">{t("formSend")}</div>
      </div>
    </Frame>
  );
}

export async function MockPayout() {
  const [t, format] = await Promise.all([getTranslations("mock"), getFormatter()]);
  const money = (cents: number) => format.number(cents / 100, { style: "currency", currency: "EUR" });
  const rows = [
    { label: t("payoutArtist"), cents: 60_000, tone: "bg-chart-2" },
    { label: t("payoutAgency"), cents: 87_000, tone: "bg-primary" },
    { label: t("payoutPlatform"), cents: 3_000, tone: "bg-magenta" },
  ];
  return (
    <Frame title={t("payoutTitle")}>
      <div className="grid gap-3 text-sm">
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground">{t("payoutReceived")}</span>
          <span className="text-xl font-semibold tabular-nums">{money(150_000)}</span>
        </div>
        <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
          {rows.map((r) => (
            <span key={r.label} className={r.tone} style={{ width: `${(r.cents / 150_000) * 100}%` }} />
          ))}
        </div>
        <ul className="grid gap-1.5 text-xs">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className={cn("size-2 rounded-sm", r.tone)} aria-hidden />
                {r.label}
              </span>
              <span className="flex items-center gap-2 tabular-nums">
                {money(r.cents)}
                <CheckIcon className="size-3.5 text-success" aria-label={t("paidOut")} />
              </span>
            </li>
          ))}
        </ul>
        <p className="rounded-lg bg-success/10 px-3 py-2 text-xs text-success">{t("payoutDone")}</p>
      </div>
    </Frame>
  );
}

export async function MockArtistRequest() {
  const t = await getTranslations("mock");
  const days = Array.from({ length: 14 }, (_, i) => i + 8);
  const busy = new Set([9, 13, 14, 20]);
  return (
    <Frame title={t("artistTitle")}>
      <div className="grid gap-3 text-sm">
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-brand-gradient text-sm font-semibold text-white">DJ</span>
          <span className="grid flex-1 text-xs">
            <span className="font-medium text-foreground">{t("artistRequest")}</span>
            <span className="text-muted-foreground">{t("artistBrief")}</span>
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
          {days.map((d) => (
            <span
              key={d}
              className={cn("rounded-md py-1 tabular-nums", d === 14 ? "bg-brand-gradient font-semibold text-white" : busy.has(d) ? "bg-muted text-muted-foreground line-through" : "bg-success/10")}
            >
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <span className="flex items-center justify-center gap-1 rounded-lg border py-2 text-muted-foreground">
            <XIcon className="size-3.5" aria-hidden />
            {t("decline")}
          </span>
          <span className="flex items-center justify-center gap-1 rounded-lg bg-success py-2 font-medium text-white">
            <CheckIcon className="size-3.5" aria-hidden />
            {t("acceptGig")}
          </span>
        </div>
      </div>
    </Frame>
  );
}

export const mockups = { quote: MockQuote, form: MockBookingForm, payout: MockPayout, artist: MockArtistRequest } as const;
export type MockupKey = keyof typeof mockups;
