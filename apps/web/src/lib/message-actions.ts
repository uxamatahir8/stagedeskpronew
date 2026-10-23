"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { type MessageChannel, markThreadRead, postMessage } from "@stagedesk/db";
import type { ActionResult } from "@/lib/actions";
import { absoluteUrl, deliver, userLocale } from "@/lib/mail";
import { messageAccess } from "@/lib/messages";
import { allow } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/viewer";

const isChannel = (value: string): value is MessageChannel => value === "customer" || value === "artist";

/** Sends a message in one of a booking's conversations the viewer takes part in. */
export async function sendMessageAction(code: string, channel: string, body: string): Promise<ActionResult> {
  const viewer = await requirePermission("messages");
  const t = await getTranslations("messages");
  const access = isChannel(channel) ? await messageAccess(viewer, code) : null;
  if (!access || !access.channels.includes(channel as MessageChannel)) return { ok: false, message: t("notAllowed") };
  const text = body.trim();
  if (!text) return { ok: false, message: t("empty") };
  if (text.length > 5000) return { ok: false, message: t("tooLong") };
  if (!(await allow(`message:${viewer.user.id}`, 30, 60))) return { ok: false, message: t("tooFast") };

  const result = await postMessage({ bookingId: access.booking.id, channel: channel as MessageChannel, authorId: viewer.user.id, body: text });
  // Customers and artists get an email too; the agency watches its dashboard.
  if (result?.emailTo) {
    const locale = userLocale(result.emailTo.locale);
    deliver({
      kind: "newMessage",
      to: result.emailTo.email,
      params: {
        locale,
        name: access.isDesk ? access.booking.organization.name : viewer.user.name,
        code: result.trackingCode,
        excerpt: text,
        url: absoluteUrl(locale, `/app/messages/${result.trackingCode}?channel=${channel}`),
      },
    });
  }
  revalidatePath("/[locale]/app", "layout");
  return { ok: true };
}

/** Marks a conversation read when the viewer opens it. */
export async function markThreadReadAction(code: string, channel: string) {
  const viewer = await requirePermission("messages");
  const access = isChannel(channel) ? await messageAccess(viewer, code) : null;
  if (access?.channels.includes(channel as MessageChannel)) await markThreadRead(viewer.user.id, access.booking.id, channel as MessageChannel);
}
