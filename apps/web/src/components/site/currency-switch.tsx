"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { CurrencyFlag, currencyName } from "@/components/currency-flag";
import { Select, SelectContent, SelectItem, SelectLabel, SelectTrigger } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import { setDisplayCurrencyAction } from "@/lib/site-actions";

/** Lets visitors see prices in their own currency (searchable, with flags); billing stays in euros. */
export function CurrencySwitch({ current, options }: { current: string; options: string[] }) {
  const t = useTranslations("site");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Select
      value={current}
      disabled={pending}
      onValueChange={(c) =>
        c !== current &&
        start(async () => {
          await setDisplayCurrencyAction(c);
          router.refresh();
        })
      }
    >
      <SelectTrigger
        aria-label={t("currencyCurrent", { currency: currencyName(current, locale) })}
        className="h-8 gap-1 border-transparent bg-transparent px-1.5 font-medium tabular-nums shadow-none hover:bg-accent sm:gap-1.5 sm:px-2 dark:bg-transparent"
      >
        <CurrencyFlag code={current} />
        {current}
      </SelectTrigger>
      <SelectContent align="end" className="w-80">
        <SelectLabel>{t("currencyHint")}</SelectLabel>
        {options.map((c) => (
          <SelectItem key={c} value={c} textValue={c}>
            <CurrencyFlag code={c} />
            <span className="w-10 font-medium tabular-nums">{c}</span>
            <span className="truncate text-muted-foreground">{currencyName(c, locale)}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
