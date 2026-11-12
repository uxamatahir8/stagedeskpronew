import "server-only";
import type { AbstractIntlMessages } from "next-intl";
import { getMessages } from "next-intl/server";
import groups from "./client-namespaces.json";
import type { Locale } from "./routing";
import type { MessageGroup } from "./client-namespaces-scan";

/**
 * The messages a layout hands to the browser: only the namespaces its client
 * code can use (client-namespaces.json, kept current by a test). Server
 * components still read every message through getTranslations.
 */
export async function clientMessages(group: MessageGroup, locale: string): Promise<AbstractIntlMessages> {
  const all = (await getMessages({ locale: locale as Locale })) as AbstractIntlMessages;
  return Object.fromEntries(groups[group].filter((ns) => ns in all).map((ns) => [ns, all[ns]!]));
}
