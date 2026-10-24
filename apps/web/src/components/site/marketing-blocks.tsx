import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { jsonLd } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { primaryCta } from "./site-chrome";

/**
 * Pieces the website pages share: section headings, rows of text next to a
 * picture, a numbered flow, FAQ and the closing call to action.
 */

export const container = "mx-auto w-full max-w-[88rem] px-5 sm:px-8 lg:px-12";

export function SectionHeading({ title, intro, className }: { title: string; intro?: string; className?: string }) {
  return (
    <div className={cn("grid max-w-2xl gap-3", className)}>
      <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-[2.1rem]">{title}</h2>
      {intro && <p className="text-lg text-muted-foreground">{intro}</p>}
    </div>
  );
}

export function Proofs({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground", className)}>
      {items.map((p) => (
        <li key={p} className="flex items-center gap-1.5">
          <CheckIcon className="size-4 text-success" aria-hidden />
          {p}
        </li>
      ))}
    </ul>
  );
}

/** Text with a short list on one side, a screenshot or mockup on the other; alternate with `reverse`. */
export function FeatureRow({ eyebrow, title, body, points, visual, reverse = false, link }: { eyebrow?: string; title: string; body: string; points: string[]; visual: ReactNode; reverse?: boolean; link?: { href: string; label: string } }) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={cn("grid content-start gap-4", reverse && "lg:order-2")}>
        {eyebrow && <p className="text-sm font-medium text-primary">{eyebrow}</p>}
        <h3 className="text-2xl font-bold tracking-tight text-balance sm:text-[1.75rem]">{title}</h3>
        <p className="text-lg text-muted-foreground">{body}</p>
        <ul className="grid gap-2.5">
          {points.map((p) => (
            <li key={p} className="flex gap-2.5">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success/15 text-success">
                <CheckIcon className="size-3.5" aria-hidden />
              </span>
              {p}
            </li>
          ))}
        </ul>
        {link && (
          <Link href={link.href} className="flex w-fit items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
            {link.label}
            <ArrowRightIcon className="size-4" aria-hidden />
          </Link>
        )}
      </div>
      <div className={cn("min-w-0", reverse && "lg:order-1")}>{visual}</div>
    </div>
  );
}

/** Numbered steps in a row on wide screens, joined by a line. */
export function Steps({ items }: { items: { title: string; body: string; label?: string }[] }) {
  return (
    <ol className={cn("relative grid gap-8 sm:grid-cols-2", items.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3", items.length === 6 && "lg:grid-cols-3 xl:grid-cols-6")}>
      {items.map((s, i) => (
        <li key={s.title} className="relative grid content-start gap-2">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground tabular-nums">{i + 1}</span>
            {i < items.length - 1 && <span aria-hidden className="hidden h-px flex-1 bg-border lg:block" />}
          </div>
          {s.label && <p className="mt-2 text-xs font-semibold tracking-wide text-primary uppercase">{s.label}</p>}
          <h3 className={cn("font-semibold", !s.label && "mt-2")}>{s.title}</h3>
          <p className="text-sm text-muted-foreground">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

/** Questions and answers, also as FAQPage structured data. */
export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  return (
    <>
      <div className="divide-y rounded-2xl border bg-card">
        {items.map((item) => (
          <details key={item.q} className="group px-5 py-4 sm:px-6 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
              {item.q}
              <span className="grid size-6 shrink-0 place-items-center rounded-full border text-muted-foreground transition-transform group-open:rotate-45" aria-hidden>
                +
              </span>
            </summary>
            <p className="mt-3 text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd({ "@type": "FAQPage", mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })) })}
      />
    </>
  );
}

/** The dark closing band with the main call to action (sign up, or the waitlist). */
export async function CtaBand({ title, body, secondary }: { title: string; body: string; secondary?: { href: string; label: string } }) {
  await connection();
  const cta = await primaryCta();
  return (
    <section className={cn(container, "py-20")}>
      <div className="grid gap-6 rounded-3xl bg-[oklch(0.24_0.08_322)] px-8 py-12 text-white sm:px-12 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="grid gap-2">
          <h2 className="text-3xl font-bold tracking-tight text-balance">{title}</h2>
          <p className="max-w-2xl text-white/75">{body}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg" className="bg-[oklch(0.66_0.2_352)] text-white hover:bg-[oklch(0.6_0.2_352)]">
            <Link href={cta.href}>
              {cta.label}
              <ArrowRightIcon />
            </Link>
          </Button>
          {secondary && (
            <Button asChild size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
              <Link href={secondary.href}>{secondary.label}</Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
