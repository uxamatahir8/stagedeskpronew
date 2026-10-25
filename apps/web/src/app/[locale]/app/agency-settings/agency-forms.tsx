"use client";

import { ImageUpIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useRef, useTransition } from "react";
import { toast } from "sonner";
import { FormMessage } from "@/components/auth/auth-card";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { DatePrefs } from "@stagedesk/core";
import { CurrencyFlag, currencyName } from "@/components/currency-flag";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateTimeFields, type DatePrefsInput } from "@/components/date-time-fields";
import { useRouter } from "@/i18n/navigation";
import type { FormState } from "@/lib/validation";
import { removeLogo, saveAgency, uploadLogo } from "./actions";

type Values = Record<
  "name" | "kvkNumber" | "vatNumber" | "contactEmail" | "phone" | "website" | "addressLine" | "postalCode" | "city" | "brandColor" | "currency",
  string
>;

/** Wraps a server action so success shows a toast and refreshes server data. */
function useToastAction(action: (prev: FormState, form: FormData) => Promise<FormState>) {
  const router = useRouter();
  return useActionState(async (prev: FormState, form: FormData) => {
    const result = await action(prev, form);
    if (result.ok) {
      toast.success(result.message);
      router.refresh();
    }
    return result;
  }, {} as FormState);
}

export function LogoForm({ name, logo }: { name: string; logo: string | null }) {
  const t = useTranslations("agencySettings");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useToastAction(uploadLogo);
  const [removing, startRemove] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("logo")}</CardTitle>
        <CardDescription>{t("logoHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-wrap items-center gap-4">
          <div className="flex size-20 items-center justify-center overflow-hidden rounded-xl border bg-white">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- served from /files
              <img src={logo} alt={name} className="size-full object-contain" />
            ) : (
              <span className="text-2xl font-bold text-primary">{name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <input
            ref={input}
            id="agency-logo"
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => input.current?.click()}>
              <ImageUpIcon />
              {t("uploadLogo")}
            </Button>
            {logo && (
              <Button
                type="button"
                variant="ghost"
                disabled={removing}
                onClick={() =>
                  startRemove(async () => {
                    const result = await removeLogo();
                    toast.success(result.message);
                    router.refresh();
                  })
                }
              >
                {t("removeLogo")}
              </Button>
            )}
          </div>
          {!state.ok && <FormMessage>{state.message}</FormMessage>}
        </form>
      </CardContent>
    </Card>
  );
}

export function AgencyForm({ values, dates, platformDates, currencyOptions }: { values: Values; dates: DatePrefsInput; platformDates: DatePrefs; currencyOptions: string[] }) {
  const td = useTranslations("dateTime");
  const t = useTranslations("agencySettings");
  const locale = useLocale();
  const [state, action, pending] = useToastAction(saveAgency);
  const errors = state.fieldErrors ?? {};

  const labels = { kvkNumber: "kvk", vatNumber: "vat" } as const;
  const field = (name: keyof Values, props: React.ComponentProps<typeof Input> = {}) => (
    <FormField
      id={`agency-${name}`}
      label={t(name === "kvkNumber" || name === "vatNumber" ? labels[name] : name)}
      error={errors[name]}
    >
      <Input id={`agency-${name}`} name={name} defaultValue={values[name]} aria-invalid={Boolean(errors[name])} {...props} />
    </FormField>
  );

  return (
    <form action={action} className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("details")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {field("name", { required: true, maxLength: 191, className: "sm:col-span-2" })}
          {field("kvkNumber", { inputMode: "numeric", maxLength: 8, placeholder: "12345678" })}
          {field("vatNumber", { maxLength: 20, placeholder: "NL123456789B01" })}
          <FormField id="agency-currency" label={t("currency")} hint={t("currencyHint")} error={errors.currency} className="sm:col-span-2">
            <Select name="currency" defaultValue={values.currency}>
              <SelectTrigger id="agency-currency" className="w-full sm:w-80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencyOptions.map((c) => (
                  <SelectItem key={c} value={c} textValue={c}>
                    <CurrencyFlag code={c} />
                    <span className="w-10 font-medium tabular-nums">{c}</span>
                    <span className="truncate text-muted-foreground">{currencyName(c, locale)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{td("title")}</CardTitle>
          <CardDescription>{td("agencyHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <DateTimeFields idPrefix="agency-dt" initial={dates} inherited={platformDates} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("contact")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {field("contactEmail", { type: "email", maxLength: 191 })}
          {field("phone", { type: "tel", maxLength: 32 })}
          {field("website", { type: "url", maxLength: 191, placeholder: "https://" })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("address")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          {field("addressLine", { maxLength: 191, autoComplete: "street-address", className: "sm:col-span-2" })}
          {field("postalCode", { maxLength: 7, autoComplete: "postal-code", placeholder: "1234 AB" })}
          {field("city", { maxLength: 96, autoComplete: "address-level2" })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("branding")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {field("brandColor", { maxLength: 7, placeholder: "#5B2A86" })}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
