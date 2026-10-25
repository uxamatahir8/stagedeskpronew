import "flag-icons/css/flag-icons.min.css";
import { currencyFlags, isCurrency } from "@stagedesk/core";
import { cn } from "@/lib/utils";

/** A small flag for a currency (the EU flag for the euro). Decorative: the code or name is always next to it. */
export function CurrencyFlag({ code, className }: { code: string; className?: string }) {
  if (!isCurrency(code)) return null;
  return <span aria-hidden className={cn("fi shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgb(0_0_0/0.08)]", `fi-${currencyFlags[code]}`, className)} />;
}

/** "Pakistani Rupee" in the viewer's language. */
export function currencyName(code: string, locale: string) {
  try {
    return new Intl.DisplayNames([locale], { type: "currency" }).of(code) ?? code;
  } catch {
    return code;
  }
}
