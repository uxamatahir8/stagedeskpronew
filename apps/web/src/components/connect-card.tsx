import { CircleCheckIcon, ClockIcon, ExternalLinkIcon, LandmarkIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { RedirectButton, type RedirectResult } from "@/components/redirect-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Stripe Connect state for the agency or an artist: not available, not yet
 * connected, waiting on Stripe, or ready, with the matching next step.
 */
export async function ConnectCard({
  stripeReady,
  account,
  body,
  connectedText,
  connect,
  dashboard,
}: {
  stripeReady: boolean;
  account: { detailsSubmitted: boolean; payoutsEnabled: boolean } | null;
  body: string;
  connectedText: string;
  connect: () => Promise<RedirectResult>;
  dashboard: () => Promise<RedirectResult>;
}) {
  const t = await getTranslations("payments");
  const ready = account?.payoutsEnabled ?? false;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LandmarkIcon className="size-4 text-muted-foreground" aria-hidden />
          {t("connectTitle")}
        </CardTitle>
        <CardDescription>{body}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3 text-sm">
        {!stripeReady ? (
          <p className="text-muted-foreground">{t("stripeMissing")}</p>
        ) : ready ? (
          <>
            <span className="flex items-center gap-2 text-success">
              <CircleCheckIcon className="size-4" aria-hidden />
              {connectedText}
            </span>
            <RedirectButton action={dashboard} variant="outline" size="sm">
              <ExternalLinkIcon />
              {t("dashboard")}
            </RedirectButton>
          </>
        ) : account?.detailsSubmitted ? (
          <>
            <span className="flex items-center gap-2 text-muted-foreground">
              <ClockIcon className="size-4" aria-hidden />
              {t("pending")}
            </span>
            <RedirectButton action={connect} variant="outline" size="sm">
              {t("continue")}
            </RedirectButton>
          </>
        ) : (
          <RedirectButton action={connect} size="sm">
            {account ? t("continue") : t("connect")}
          </RedirectButton>
        )}
      </CardContent>
    </Card>
  );
}
