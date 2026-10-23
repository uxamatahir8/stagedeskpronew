"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyField } from "@/components/copy-field";

const pages = [
  { key: "home", path: "/" },
  { key: "signUp", path: "/sign-up" },
] as const;

/** Builds a referral link for a campaign (?c=) and landing page. */
export function LinkBuilder({ base, code }: { base: string; code: string }) {
  const t = useTranslations("affiliate");
  const [campaign, setCampaign] = useState("");
  const [page, setPage] = useState<string>("/");
  const url = new URL(page, base);
  url.searchParams.set("via", code);
  if (campaign) url.searchParams.set("c", campaign);

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="lb-campaign" label={t("campaign")} hint={t("campaignHint")}>
          <Input
            id="lb-campaign"
            value={campaign}
            maxLength={48}
            placeholder="instagram"
            onChange={(e) => setCampaign(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
          />
        </FormField>
        <FormField id="lb-page" label={t("landingPage")}>
          <Select value={page} onValueChange={setPage}>
            <SelectTrigger id="lb-page" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pages.map((p) => (
                <SelectItem key={p.key} value={p.path}>
                  {t(`page_${p.key}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>
      <CopyField label={t("yourLink")} value={url.toString()} />
    </div>
  );
}
