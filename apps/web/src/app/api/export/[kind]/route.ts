import { can, type Permission } from "@stagedesk/core";
import { tenantDb } from "@stagedesk/db";
import { getViewer } from "@/lib/viewer";

const kinds: Record<string, Permission> = {
  bookings: "agency.bookings",
  customers: "agency.customers",
  payments: "agency.payments",
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

/** The agency's own data as CSV (UTF-8 with BOM so Excel reads accents). */
export async function GET(_request: Request, { params }: RouteContext<"/api/export/[kind]">) {
  const { kind } = await params;
  const permission = kinds[kind];
  const viewer = await getViewer();
  if (!permission) return new Response(null, { status: 404 });
  if (!viewer?.role || !viewer.organization || !can(viewer.role, permission)) return new Response(null, { status: 403 });
  const db = tenantDb(viewer.organization.id);

  let rows: unknown[][] = [];
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

  const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
  const filename = `stagedesk-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
  });
}
