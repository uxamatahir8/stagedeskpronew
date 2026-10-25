"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormState } from "@/lib/validation";
import { createAgency, createSoloArtistAction } from "./actions";

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

/** For an independent artist: their stage name is their business name. */
export function SoloArtistForm() {
  const t = useTranslations("onboarding");
  const [state, action, pending] = useActionState(createSoloArtistAction, {} as FormState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="grid gap-4">
      <FormField id="solo-name" label={t("stageName")} error={errors["stageName"]}>
        <Input id="solo-name" name="stageName" required maxLength={120} autoComplete="nickname" />
      </FormField>
      <FormField id="solo-city" label={t("city")} error={errors["city"]}>
        <Input id="solo-city" name="city" maxLength={96} autoComplete="address-level2" />
      </FormField>
      <FormField id="solo-genres" label={t("genres")} hint={t("genresHint")} error={errors["genres"]}>
        <Input id="solo-genres" name="genres" maxLength={500} placeholder={t("genresPlaceholder")} />
      </FormField>
      <Button type="submit" disabled={pending}>
        {t("soloSubmit")}
      </Button>
    </form>
  );
}
