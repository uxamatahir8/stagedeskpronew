import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { getSetting, prisma, secretHints } from "@stagedesk/db";
import { handledStripeEvents, stripeConfig } from "@stagedesk/payments";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { appUrl } from "@/lib/mail";
import { requirePermission } from "@/lib/viewer";
import { PaymentMethodsForm, StripeSetup } from "./forms";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/settings/payments">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "paymentSetup" });
  return { title: t("title") };
}

export default async function PaymentSetupPage({ params }: PageProps<"/[locale]/app/settings/payments">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
      <PaymentSetup />
    </Suspense>
  );
}

async function PaymentSetup() {
  await requirePermission("platform.settings");
  const [t, format, config, hints, methods, connected, agencies] = await Promise.all([
    getTranslations("paymentSetup"),
    getFormatter(),
    stripeConfig(),
    secretHints(),
    getSetting("payments.methods"),
    prisma.connectedAccount.count({ where: { artistId: null, chargesEnabled: true } }),
    prisma.organization.count({ where: { suspendedAt: null } }),
  ]);
  const saved = (k: keyof typeof hints) => (hints[k] ? { hint: hints[k]!.hint, updatedAt: format.dateTime(hints[k]!.updatedAt, { day: "numeric", month: "short", year: "numeric" }) } : null);

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <StripeSetup
        status={{ source: config.source, mode: config.mode, webhook: Boolean(config.webhookSecret), publishable: Boolean(config.publishableKey) }}
        saved={{ secretKey: saved("stripe.secretKey"), publishableKey: saved("stripe.publishableKey"), webhookSecret: saved("stripe.webhookSecret") }}
        webhookUrl={`${appUrl}/api/webhooks/stripe`}
        events={[...handledStripeEvents]}
        connected={{ agencies: connected, total: agencies }}
      />
      <PaymentMethodsForm methods={methods} stripeReady={config.secretKey !== null} />
    </div>
  );
}
