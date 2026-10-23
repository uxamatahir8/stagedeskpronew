import { ExternalLinkIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { parsePageContent, pendingLegal } from "@stagedesk/db";
import { AuthCard } from "@/components/auth/auth-card";
import { Skeleton } from "@/components/ui/skeleton";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getViewer } from "@/lib/viewer";
import { AcceptForm } from "./accept-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/accept-terms">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "acceptTerms" });
  return { title: t("title"), robots: { index: false } };
}

export default async function AcceptTermsPage({ params }: PageProps<"/[locale]/accept-terms">) {
  setRequestLocale((await params).locale as Locale);
  const t = await getTranslations("acceptTerms");
  return (
    <AuthCard title={t("title")} description={t("body")}>
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <Pending />
      </Suspense>
    </AuthCard>
  );
}

async function Pending() {
  const viewer = await getViewer();
  const locale = (await getLocale()) as Locale;
  if (!viewer) redirect({ href: "/sign-in", locale });
  const pending = await pendingLegal(viewer!.user.id);
  if (pending.length === 0) redirect({ href: "/app", locale });
  const [t, format] = await Promise.all([getTranslations("acceptTerms"), getFormatter()]);
  const prefix = locale === "en" ? "/en" : "";

  return (
    <div className="grid gap-5">
      <ul className="grid gap-2">
        {pending.map((p) => {
          const content = p.publishedVersion ? parsePageContent(p.publishedVersion.content) : null;
          return (
            <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <span className="grid">
                <span className="font-medium">{content?.[locale].title ?? p.slugEn}</span>
                {p.publishedVersion?.publishedAt && (
                  <span className="text-xs text-muted-foreground">{t("updated", { date: format.dateTime(p.publishedVersion.publishedAt, { day: "numeric", month: "long", year: "numeric" }) })}</span>
                )}
              </span>
              {/* Opens in a new tab so the acceptance step stays put. */}
              <a href={`${prefix}/${locale === "en" ? p.slugEn : p.slugNl}`} target="_blank" rel="noopener" className="flex items-center gap-1 text-primary underline-offset-4 hover:underline">
                {t("read")}
                <ExternalLinkIcon className="size-3.5" aria-hidden />
              </a>
            </li>
          );
        })}
      </ul>
      <AcceptForm versionIds={pending.map((p) => p.publishedVersionId!)} />
    </div>
  );
}
