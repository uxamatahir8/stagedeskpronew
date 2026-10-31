import type { Permission } from "@stagedesk/core";
import { inventoryExportRows, prisma, tenantDb } from "@stagedesk/db";
import { getViewer } from "@/lib/viewer";

const kinds: Record<string, Permission> = {
  bookings: "agency.reports",
  customers: "agency.customers",
  equipment: "agency.inventory",
  payments: "agency.reports",
  waitlist: "platform.pages",
  withdrawals: "platform.affiliates",
  commissions: "platform.affiliates",
  newsletter: "platform.newsletter",
};

/** RFC 4180 field: quoted when needed; a leading =, +, - or @ is defused so spreadsheets don't run it as a formula. */
function cell(value: unknown) {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
const euros = (cents: number) => (cents / 100).toFixed(2);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

/** UTF-8 with BOM so Excel reads accents. */
function csvResponse(kind: string, rows: unknown[][]) {
  const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
  const filename = `stagedesk-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
  });
}

/** The agency's own data as CSV; the waitlist for platform admins. */
export async function GET(_request: Request, { params }: RouteContext<"/api/export/[kind]">) {
  const { kind } = await params;
  const permission = kinds[kind];
  const viewer = await getViewer();
  if (!permission) return new Response(null, { status: 404 });
  if (!viewer?.role || !viewer.permissions.includes(permission)) return new Response(null, { status: 403 });

  if (kind === "waitlist") {
    // Platform-level list, not agency data.
    const entries = await prisma.waitlistEntry.findMany({ orderBy: { createdAt: "asc" } });
    return csvResponse(kind, [["email", "name", "role", "company", "language", "source", "joined"], ...entries.map((e) => [e.email, e.name, e.role, e.company, e.locale, e.source, e.createdAt])]);
  }

  if (kind === "newsletter") {
    const subscribers = await prisma.newsletterSubscriber.findMany({ orderBy: { createdAt: "asc" } });
    return csvResponse(kind, [["email", "name", "status", "language", "source", "subscribed_at", "confirmed_at", "unsubscribed_at"], ...subscribers.map((s) => [s.email, s.name, s.status, s.locale, s.source, s.createdAt, s.confirmedAt, s.unsubscribedAt])]);
  }

  if (kind === "withdrawals") {
    // Every affiliate withdrawal with where it went and how it was paid.
    const payouts = await prisma.affiliatePayout.findMany({ orderBy: { createdAt: "desc" }, include: { affiliate: { include: { user: { select: { name: true, email: true } } } }, _count: { select: { commissions: true } } } });
    return csvResponse(kind, [
      ["reference", "partner", "email", "method", "status", "amount_eur", "commissions", "destination", "transaction_ref", "requested_at", "paid_at", "reject_reason"],
      ...payouts.map((p) => {
        const d = (p.details ?? {}) as { iban?: string; accountName?: string; paypalEmail?: string; stripeAccountId?: string };
        return [p.reference, p.affiliate.user.name, p.affiliate.user.email, p.method, p.status, euros(p.amountCents), p._count.commissions, d.iban ? `${d.accountName ?? ""} ${d.iban}` : (d.paypalEmail ?? d.stripeAccountId ?? ""), p.transactionRef ?? p.stripeTransferId, p.createdAt, p.paidAt, p.rejectReason];
      }),
    ]);
  }
  if (kind === "commissions") {
    const commissions = await prisma.commission.findMany({
      orderBy: { createdAt: "desc" },
      include: { affiliate: { include: { user: { select: { name: true } } } }, referral: { select: { agency: { select: { name: true } } } }, payout: { select: { reference: true } } },
    });
    return csvResponse(kind, [
      ["created_at", "partner", "agency", "stripe_invoice", "invoice_eur", "rate_pct", "commission_eur", "status", "available_at", "withdrawal", "cancel_reason"],
      ...commissions.map((c) => [c.createdAt, c.affiliate.user.name, c.referral.agency.name, c.stripeInvoiceId, euros(c.baseCents), (c.commissionBps / 100).toFixed(2), euros(c.amountCents), c.status, c.availableAt, c.payout?.reference, c.cancelReason]),
    ]);
  }

  if (!viewer.organization) return new Response(null, { status: 403 });
  const db = tenantDb(viewer.organization.id);
  let rows: unknown[][];
  if (kind === "bookings") {
    const bookings = await db.booking.findMany({
      orderBy: { createdAt: "desc" },
      include: { customer: { select: { name: true, email: true } }, assignments: { where: { status: "accepted" }, take: 1, select: { artist: { select: { stageName: true } } } } },
    });
    rows = [
      ["code", "status", "event_type", "event_date", "customer", "email", "venue", "city", "artist", "total_eur", "paid_eur", "source", "created_at"],
      ...bookings.map((b) => [
        b.trackingCode, b.status, b.eventType, day(b.eventDate), b.customer?.name, b.customer?.email, b.venueName, b.venueCity,
        b.assignments[0]?.artist.stageName, euros(b.totalCents), euros(b.paidCents), b.source, b.createdAt,
      ]),
    ];
  } else if (kind === "equipment") {
    // The agency's own equipment only (inventoryExportRows reads through tenantDb).
    const items = await inventoryExportRows(viewer.organization.id);
    const header = ["code", "name", "kind", "tracking", "quantity", "defective", "status", "condition", "category", "container", "manufacturer", "model", "serialNumber", "powerWatts", "batteryPowered", "shared", "notes"] as const;
    rows = [[...header], ...items.map((i) => header.map((h) => i[h]))];
  } else if (kind === "customers") {
    const members = await db.member.findMany({ where: { role: "customer" }, include: { user: { select: { name: true, email: true, phone: true, createdAt: true } } } });
    rows = [["name", "email", "phone", "since"], ...members.map((m) => [m.user.name, m.user.email, m.user.phone, day(m.user.createdAt)])];
  } else {
    const payments = await db.payment.findMany({ orderBy: { receivedAt: "desc" }, include: { booking: { select: { trackingCode: true } } } });
    rows = [
      ["date", "booking", "kind", "method", "amount_eur", "refunded_eur", "reference"],
      ...payments.map((p) => [day(p.receivedAt), p.booking.trackingCode, p.kind, p.method, euros(p.amountCents), euros(p.refundedCents), p.reference]),
    ];
  }
  return csvResponse(kind, rows);
}
