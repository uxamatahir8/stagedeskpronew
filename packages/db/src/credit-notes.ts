import { randomUUID } from "node:crypto";
import { type CreditVatGroup, creditableCents, creditNoteAmounts, creditNoteNumber, todayInNetherlands } from "@stagedesk/core";
import { nextCounter } from "./bookings";
import type { Prisma } from "./generated/prisma/client";

/**
 * Called in the transaction that books a refund. Money refunded on an invoiced
 * booking gets a numbered credit note, because an issued invoice itself never
 * changes. `paidBeforeRefundCents` is what the booking had received just before
 * this refund. Returns null when nothing has to be credited: no invoice, or the
 * refund only returned what was paid above the invoice total.
 */
export async function creditRefundTx(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; bookingId: string; refundCents: number; paidBeforeRefundCents: number; sourceKey: string; now?: Date },
) {
  const now = input.now ?? new Date();
  if (await tx.creditNote.findUnique({ where: { sourceKey: input.sourceKey }, select: { id: true } })) return null;
  const invoice = await tx.invoice.findFirst({ where: { bookingId: input.bookingId, organizationId: input.organizationId }, orderBy: { issuedAt: "asc" } });
  if (!invoice) return null;
  const credited = await tx.creditNote.aggregate({ where: { invoiceId: invoice.id }, _sum: { totalCents: true } });
  const creditCents = creditableCents({
    refundCents: input.refundCents,
    paidBeforeRefundCents: input.paidBeforeRefundCents,
    invoiceTotalCents: invoice.totalCents,
    alreadyCreditedCents: credited._sum.totalCents ?? 0,
  });
  if (creditCents <= 0) return null;
  const groups = ((invoice.data as { vatGroups?: CreditVatGroup[] }).vatGroups ?? []) as CreditVatGroup[];
  const amounts = creditNoteAmounts(creditCents, groups);
  const year = Number(todayInNetherlands(now).slice(0, 4));
  const sequence = await nextCounter(tx as never, input.organizationId, `credit-note-${year}`);
  return tx.creditNote.create({
    data: {
      id: randomUUID(),
      organizationId: input.organizationId,
      bookingId: input.bookingId,
      invoiceId: invoice.id,
      sourceKey: input.sourceKey,
      number: creditNoteNumber(year, sequence),
      issuedAt: now,
      subtotalCents: amounts.subtotalCents,
      vatCents: amounts.vatCents,
      totalCents: amounts.totalCents,
      vatGroups: amounts.vatGroups as unknown as Prisma.InputJsonValue,
    },
  });
}
