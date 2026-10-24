"use client";

import { CheckIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { currencies } from "@stagedesk/core";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useRouter } from "@/i18n/navigation";
import { setDisplayCurrencyAction } from "@/lib/site-actions";

/** Lets visitors see prices in their own currency; billing stays in euros. */
export function CurrencySwitch({ current }: { current: string }) {
  const t = useTranslations("site");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const name = (code: string) => new Intl.DisplayNames([locale], { type: "currency" }).of(code) ?? code;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={pending} aria-label={t("currencyCurrent", { currency: name(current) })} className="tabular-nums">
          {current}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t("currencyHint")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {currencies.map((c) => (
          <DropdownMenuItem
            key={c}
            onSelect={() =>
              c !== current &&
              start(async () => {
                await setDisplayCurrencyAction(c);
                router.refresh();
              })
            }
          >
            <span className="w-9 font-medium tabular-nums">{c}</span>
            <span className="text-muted-foreground">{name(c)}</span>
            {c === current && <CheckIcon className="ml-auto" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
