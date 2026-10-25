import { MonitorIcon, SmartphoneIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { emailSamples, type EmailJob, type EmailKind, previewEmailJob } from "@stagedesk/emails";
import { FilterChips } from "@/components/list-controls";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { appUrl } from "@/lib/mail";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/lib/viewer";
import { SendTestButton } from "./send-test";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/emails">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "emailPreviews" });
  return { title: t("title") };
}

export default async function EmailsPage({ params, searchParams }: PageProps<"/[locale]/app/emails">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
      <Emails searchParams={searchParams} />
    </Suspense>
  );
}

/** The emails grouped by who receives them, in the order the list shows. */
const groups: { key: "account" | "bookings" | "leads" | "team" | "partners" | "platform"; kinds: EmailKind[] }[] = [
  { key: "account", kinds: ["verifyEmail", "loginCode", "resetPassword"] },
  { key: "bookings", kinds: ["inquiryReceived", "newInquiry", "quote", "quoteExpiring", "balanceDue", "eventReminder", "newMessage", "paymentReported", "paymentReceipt", "paymentNotReceived"] },
  { key: "leads", kinds: ["leadReceived", "leadOffer"] },
  { key: "team", kinds: ["invitation", "gigReminder", "agencyCreated"] },
  { key: "partners", kinds: ["affiliateApproved", "affiliatePayout"] },
  { key: "platform", kinds: ["ticketReply", "contactMessage"] },
];
const kinds = groups.flatMap((g) => g.kinds);
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

async function Emails({ searchParams }: Pick<PageProps<"/[locale]/app/emails">, "searchParams">) {
  await connection();
  await requirePermission("platform.settings");
  const sp = await searchParams;
  const kind = kinds.includes(one(sp["kind"]) as EmailKind) ? (one(sp["kind"]) as EmailKind) : kinds[0]!;
  const lang = one(sp["lang"]) === "en" ? "en" : "nl";
  const view = one(sp["view"]) === "text" ? "text" : "html";
  const mobile = one(sp["width"]) === "mobile";
  const t = await getTranslations("emailPreviews");
  const tl = await getTranslations("languages");

  const params = emailSamples(lang, appUrl)[kind];
  const email = await previewEmailJob({ kind, to: "preview@stagedesk.local", params } as EmailJob);
  const href = (patch: Partial<{ kind: string; lang: string; view: string; width: string }>) => {
    const next = new URLSearchParams({ kind, lang, view, width: mobile ? "mobile" : "desktop", ...patch });
    return `/app/emails?${next.toString()}`;
  };

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} actions={<SendTestButton kind={kind} lang={lang} />} />
      <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
        <nav className="grid content-start gap-5 lg:sticky lg:top-20 lg:max-h-[calc(100svh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-1" aria-label={t("list")}>
          {groups.map((g) => (
            <div key={g.key} className="grid gap-1">
              <h2 className="px-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{t(`group_${g.key}`)}</h2>
              {g.kinds.map((k) => (
                <Link
                  key={k}
                  href={href({ kind: k })}
                  aria-current={k === kind ? "page" : undefined}
                  className={cn(
                    "grid gap-0.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
                    k === kind ? "bg-primary/10 text-primary" : "hover:bg-muted",
                  )}
                >
                  <span className="font-medium">{t(`kind_${k}`)}</span>
                  <span className="text-xs text-muted-foreground">{t(`kind_${k}Hint`)}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <Card className="min-w-0">
          <CardHeader className="gap-3">
            <div className="grid gap-1">
              <CardDescription>{t("subject")}</CardDescription>
              <CardTitle className="text-lg">{email.subject}</CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <FilterChips
                label={t("language")}
                options={[
                  { key: "nl", label: tl("nl"), href: href({ lang: "nl" }), active: lang === "nl" },
                  { key: "en", label: tl("en"), href: href({ lang: "en" }), active: lang === "en" },
                ]}
              />
              <FilterChips
                label={t("format")}
                options={[
                  { key: "html", label: t("html"), href: href({ view: "html" }), active: view === "html" },
                  { key: "text", label: t("text"), href: href({ view: "text" }), active: view === "text" },
                ]}
              />
              {view === "html" && (
                <div className="flex gap-1" role="group" aria-label={t("width")}>
                  <Link href={href({ width: "desktop" })} aria-label={t("desktop")} aria-current={!mobile ? "true" : undefined} className={cn("rounded-md p-1.5", !mobile ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>
                    <MonitorIcon className="size-4" aria-hidden />
                  </Link>
                  <Link href={href({ width: "mobile" })} aria-label={t("mobile")} aria-current={mobile ? "true" : undefined} className={cn("rounded-md p-1.5", mobile ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>
                    <SmartphoneIcon className="size-4" aria-hidden />
                  </Link>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {view === "html" ? (
              <div className="overflow-x-auto rounded-xl border bg-[#f4f1f6] p-4">
                {/* Email HTML runs in a sandbox with no scripts; links open nowhere. */}
                <iframe title={t("previewOf", { name: t(`kind_${kind}`) })} srcDoc={email.html} sandbox="" className={cn("mx-auto block h-[42rem] rounded-lg bg-white", mobile ? "w-[375px]" : "w-full max-w-[680px]")} />
              </div>
            ) : (
              <pre className="max-h-[42rem] overflow-auto rounded-xl border bg-muted/40 p-4 font-mono text-sm whitespace-pre-wrap">{email.text}</pre>
            )}
            <p className="mt-3 text-xs text-muted-foreground">{t("sampleNote")}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
