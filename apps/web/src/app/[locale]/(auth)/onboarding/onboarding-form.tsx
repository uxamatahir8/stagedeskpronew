"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormState } from "@/lib/validation";
import { createAgency } from "./actions";

export function OnboardingForm() {
  const t = useTranslations("onboarding");
  const [state, action, pending] = useActionState(createAgency, {} as FormState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="grid gap-4">
      <FormField id="onb-name" label={t("agencyName")} error={errors["name"]}>
        <Input id="onb-name" name="name" required maxLength={100} autoComplete="organization" />
      </FormField>
      <FormField id="onb-city" label={t("city")} error={errors["city"]}>
        <Input id="onb-city" name="city" maxLength={96} autoComplete="address-level2" />
      </FormField>
      <FormField id="onb-kvk" label={t("kvk")} error={errors["kvkNumber"]}>
        <Input id="onb-kvk" name="kvkNumber" inputMode="numeric" maxLength={8} />
      </FormField>
      <FormField id="onb-promo" label={t("partnerCode")} hint={t("partnerCodeHint")} error={errors["promoCode"]}>
        <Input id="onb-promo" name="promoCode" maxLength={24} autoCapitalize="characters" className="uppercase" />
      </FormField>
      <Button type="submit" disabled={pending}>
        {t("submit")}
      </Button>
    </form>
  );
}
