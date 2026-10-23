"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { can } from "@stagedesk/core";
import { audit, openTicket, prisma, replyToTicket, setTicketStatus, ticketCategories } from "@stagedesk/db";
import type { ActionResult } from "@/lib/actions";
import { absoluteUrl, deliver, userLocale } from "@/lib/mail";
import { allow } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/viewer";

const newTicket = z.object({
  subject: z.string().trim().min(3).max(191),
  category: z.enum(ticketCategories),
  body: z.string().trim().min(10).max(10_000),
});

export type OpenTicketResult = { ok: true; reference: string } | { ok: false; message: string };

export async function openTicketAction(input: z.input<typeof newTicket>): Promise<OpenTicketResult> {
  const viewer = await requirePermission("support");
  const t = await getTranslations("support");
  const parsed = newTicket.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("invalid") };
  if (!(await allow(`ticket:${viewer.user.id}`, 5, 3600))) return { ok: false, message: t("tooMany") };
  const ticket = await openTicket({ userId: viewer.user.id, agencyId: viewer.organization?.id ?? null, ...parsed.data });
  revalidatePath("/[locale]/app/support", "page");
  return { ok: true, reference: ticket.reference };
}

/** The requester or support staff (platform admins) replies. */
export async function replyTicketAction(reference: string, body: string): Promise<ActionResult> {
  const viewer = await requirePermission("support");
  const t = await getTranslations("support");
  const ticket = await prisma.supportTicket.findUnique({ where: { reference }, select: { userId: true } });
  const staff = can(viewer.role, "platform.support");
  if (!ticket || (!staff && ticket.userId !== viewer.user.id)) return { ok: false, message: t("notFound") };
  const text = body.trim();
  if (text.length < 2 || text.length > 10_000) return { ok: false, message: t("invalidReply") };
  if (!(await allow(`ticket-reply:${viewer.user.id}`, 30, 3600))) return { ok: false, message: t("tooMany") };

  const updated = await replyToTicket({ reference, authorId: viewer.user.id, fromStaff: staff, body: text });
  if (staff) {
    const locale = userLocale(updated.user.locale);
    deliver({
      kind: "ticketReply",
      to: updated.user.email,
      params: { locale, name: updated.user.name.split(/\s+/)[0] ?? updated.user.name, ref: reference, subject: updated.subject, excerpt: text, url: absoluteUrl(locale, `/app/support/${reference}`) },
    });
  }
  revalidatePath("/[locale]/app/support", "layout");
  return { ok: true, message: t("replied") };
}

export async function setTicketStatusAction(reference: string, status: "open" | "closed"): Promise<ActionResult> {
  const viewer = await requirePermission("support");
  const t = await getTranslations("support");
  const ticket = await prisma.supportTicket.findUnique({ where: { reference }, select: { userId: true, id: true } });
  const staff = can(viewer.role, "platform.support");
  if (!ticket || (!staff && ticket.userId !== viewer.user.id)) return { ok: false, message: t("notFound") };
  await setTicketStatus(reference, status);
  if (staff) await audit({ actorId: viewer.user.id, action: `ticket.${status === "closed" ? "close" : "reopen"}`, targetType: "ticket", targetId: ticket.id });
  revalidatePath("/[locale]/app/support", "layout");
  return { ok: true, message: t(status === "closed" ? "closed" : "reopened") };
}
