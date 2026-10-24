"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { CopyField } from "@/components/copy-field";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";

/**
 * Builds a referral link for a campaign (?c=). Every link opens agency
 * registration, because only an agency that signs up counts as a referral.
 */
export function LinkBuilder({ base, code }: { base: string; code: string }) {
  const t = useTranslations("affiliate");
  const [campaign, setCampaign] = useState("");
  const url = new URL("/sign-up", base);
  url.searchParams.set("via", code);
  if (campaign) url.searchParams.set("c", campaign);

  return (
    <div className="grid gap-4">
      <FormField id="lb-campaign" label={t("campaign")} hint={t("campaignHint")}>
        <Input
          id="lb-campaign"
          value={campaign}
          maxLength={48}
          placeholder="instagram"
          className="sm:max-w-sm"
          onChange={(e) => setCampaign(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
        />
      </FormField>
      <CopyField label={t("yourLink")} value={url.toString()} />
      <p className="text-sm text-muted-foreground">{t("linkOpensSignUp")}</p>
    </div>
  );
}
