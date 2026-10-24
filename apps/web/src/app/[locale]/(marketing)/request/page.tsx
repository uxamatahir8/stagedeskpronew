import { FileTextIcon, HandshakeIcon, type LucideIcon, SendIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { todayInNetherlands } from "@stagedesk/core";
import { InquiryForm } from "@/components/booking/inquiry-form";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import { turnstileSiteKey } from "@/lib/turnstile";
import { submitLeadAction } from "./actions";

export async function generateMetadata({ params }: PageProps<"/[locale]/request">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "leadForm" });
  return pageMetadata({ locale, title: t("metaTitle"), description: t("metaDescription"), paths: { nl: "/request", en: "/request" }, kicker: t("eyebrow") });
}

const steps: { key: "s1" | "s2" | "s3"; icon: LucideIcon }[] = [
  { key: "s1", icon: SendIcon },
  { key: "s2", icon: HandshakeIcon },
  { key: "s3", icon: FileTextIcon },
];

export default async function RequestPage({ params }: PageProps<"/[locale]/request">) {
  setRequestLocale((await params).locale as Locale);
  const t = await getTranslations("leadForm");
  return (
    <main className="mx-auto grid w-full max-w-[88rem] gap-12 px-5 py-16 sm:px-8 lg:px-12 sm:py-20 lg:grid-cols-[1fr_1.4fr] lg:items-start">
      <div className="grid content-start gap-8 lg:sticky lg:top-24">
        <div className="grid gap-4">
          <p className="text-sm font-medium text-magenta">{t("eyebrow")}</p>
          <h1 className="text-4xl font-bold tracking-tight text-balance">{t.rich("title", { hl: (c) => <span className="text-brand-gradient">{c}</span> })}</h1>
          <p className="text-lg text-muted-foreground">{t("intro")}</p>
        </div>
        <ol className="grid gap-5">
          {steps.map(({ key, icon: Icon }, i) => (
            <li key={key} className="flex gap-4">
              <span className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white">
                <Icon className="size-5" aria-hidden />
                <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border-2 border-background bg-foreground text-[10px] font-bold text-background">{i + 1}</span>
              </span>
              <span className="grid gap-0.5">
                <span className="font-semibold">{t(`${key}Title`)}</span>
                <span className="text-sm text-muted-foreground">{t(`${key}Body`)}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted-foreground">{t("free")}</p>
      </div>
      <section className="grid gap-6 rounded-3xl border bg-card p-6 shadow-sm sm:p-10" aria-labelledby="lead-form">
        <h2 id="lead-form" className="text-2xl font-semibold tracking-tight">
          {t("formTitle")}
        </h2>
        <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
          <LeadForm />
        </Suspense>
      </section>
    </main>
  );
}

async function LeadForm() {
  // Reads the date (for the earliest allowed event day), so it renders per request.
  await connection();
  return <InquiryForm kind="platform" submitAction={submitLeadAction} artists={[]} fullyBooked={[]} siteKey={turnstileSiteKey()} today={todayInNetherlands()} />;
}
