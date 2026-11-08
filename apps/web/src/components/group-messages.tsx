import { NextIntlClientProvider } from "next-intl";
import { clientMessages } from "@/i18n/client-messages";
import type { MessageGroup } from "@/i18n/client-namespaces-scan";

/** Gives the browser code inside it only its layout's messages (see client-namespaces.json). */
export async function GroupMessages({ group, locale, children }: { group: MessageGroup; locale: string; children: React.ReactNode }) {
  return <NextIntlClientProvider messages={await clientMessages(group, locale)}>{children}</NextIntlClientProvider>;
}
