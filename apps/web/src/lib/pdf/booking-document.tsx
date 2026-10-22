import "server-only";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

export interface PdfLine {
  description: string;
  quantityHundredths: number;
  unitPriceCents: number;
  vatBps: number;
  subtotalCents: number;
}

export interface PdfData {
  kind: "quote" | "invoice";
  locale: "nl" | "en";
  labels: Record<
    | "title"
    | "number"
    | "date"
    | "dueDate"
    | "validUntil"
    | "reference"
    | "eventDate"
    | "to"
    | "kvk"
    | "vatNumber"
    | "description"
    | "quantity"
    | "unitPrice"
    | "vat"
    | "lineTotal"
    | "subtotal"
    | "total"
    | "deposit"
    | "alreadyPaid"
    | "toPay"
    | "footer",
    string
  >;
  agency: {
    name: string;
    addressLine?: string | null;
    postalCode?: string | null;
    city?: string | null;
    contactEmail?: string | null;
    kvkNumber?: string | null;
    vatNumber?: string | null;
    logo?: { data: Buffer; format: "png" | "jpg" } | null;
    brandColor?: string | null;
  };
  customer: { name: string; email?: string | null } | null;
  number: string;
  issued: Date;
  due: Date | null;
  reference: string;
  eventDate: string | null;
  lines: PdfLine[];
  vatGroups: { rateBps: number; baseCents: number; vatCents: number }[];
  subtotalCents: number;
  totalCents: number;
  depositCents?: number;
  paidCents?: number;
  notes?: string | null;
}

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 10, fontFamily: "Helvetica", color: "#1b1724" },
  row: { flexDirection: "row" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 32 },
  logo: { width: 64, height: 64, objectFit: "contain", marginBottom: 8 },
  agencyName: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  muted: { color: "#6b6378" },
  title: { fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  meta: { marginBottom: 24, flexDirection: "row", justifyContent: "space-between" },
  metaBlock: { gap: 2 },
  label: { color: "#6b6378", fontSize: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  table: { borderTopWidth: 1, borderColor: "#e2dceb" },
  th: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderColor: "#e2dceb", color: "#6b6378", fontSize: 8 },
  tr: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderColor: "#f0edf5" },
  colDesc: { flex: 1 },
  colNum: { width: 70, textAlign: "right" },
  colQty: { width: 44, textAlign: "right" },
  colVat: { width: 40, textAlign: "right" },
  totals: { marginTop: 16, marginLeft: "auto", width: 220, gap: 4 },
  totalRow: { flexDirection: "row", justifyContent: "space-between" },
  grand: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderColor: "#1b1724", paddingTop: 6, fontFamily: "Helvetica-Bold", fontSize: 12 },
  notes: { marginTop: 24, padding: 10, backgroundColor: "#f6f4fa" },
  footer: { position: "absolute", bottom: 32, left: 48, right: 48, fontSize: 8, color: "#6b6378" },
});

export function BookingDocument({ data }: { data: PdfData }) {
  const nf = new Intl.NumberFormat(data.locale === "en" ? "en-NL" : "nl-NL", { style: "currency", currency: "EUR" });
  const pf = new Intl.NumberFormat(data.locale === "en" ? "en-NL" : "nl-NL", { style: "percent", maximumFractionDigits: 2 });
  const qf = new Intl.NumberFormat(data.locale === "en" ? "en-NL" : "nl-NL", { maximumFractionDigits: 2 });
  const df = new Intl.DateTimeFormat(data.locale === "en" ? "en-GB" : "nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });
  const money = (c: number) => nf.format(c / 100);
  const date = (d: Date) => df.format(d);
  const L = data.labels;
  const a = data.agency;
  const accent = a.brandColor ?? "#5b2a86";

  return (
    <Document title={`${L.title} ${data.number}`} author={a.name}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image is drawn into the PDF and has no alt */}
            {a.logo && <Image src={a.logo} style={styles.logo} />}
            <Text style={styles.agencyName}>{a.name}</Text>
            {a.addressLine && <Text style={styles.muted}>{a.addressLine}</Text>}
            {(a.postalCode || a.city) && <Text style={styles.muted}>{[a.postalCode, a.city].filter(Boolean).join(" ")}</Text>}
            {a.contactEmail && <Text style={styles.muted}>{a.contactEmail}</Text>}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.title, { color: accent }]}>{L.title}</Text>
            {a.kvkNumber && <Text style={styles.muted}>{`${L.kvk} ${a.kvkNumber}`}</Text>}
            {a.vatNumber && <Text style={styles.muted}>{`${L.vatNumber} ${a.vatNumber}`}</Text>}
          </View>
        </View>

        <View style={styles.meta}>
          <View style={styles.metaBlock}>
            <Text style={styles.label}>{L.to}</Text>
            <Text>{data.customer?.name ?? "—"}</Text>
            {data.customer?.email && <Text style={styles.muted}>{data.customer.email}</Text>}
          </View>
          <View style={[styles.metaBlock, { alignItems: "flex-end" }]}>
            <Text style={styles.label}>{L.number}</Text>
            <Text>{data.number}</Text>
            <Text style={styles.label}>{L.date}</Text>
            <Text>{date(data.issued)}</Text>
            {data.due && (
              <>
                <Text style={styles.label}>{data.kind === "quote" ? L.validUntil : L.dueDate}</Text>
                <Text>{date(data.due)}</Text>
              </>
            )}
            <Text style={styles.label}>{L.reference}</Text>
            <Text>{data.reference}</Text>
            {data.eventDate && (
              <>
                <Text style={styles.label}>{L.eventDate}</Text>
                <Text>{date(new Date(`${data.eventDate}T12:00:00Z`))}</Text>
              </>
            )}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.th}>
            <Text style={styles.colDesc}>{L.description}</Text>
            <Text style={styles.colQty}>{L.quantity}</Text>
            <Text style={styles.colNum}>{L.unitPrice}</Text>
            <Text style={styles.colVat}>{L.vat}</Text>
            <Text style={styles.colNum}>{L.lineTotal}</Text>
          </View>
          {data.lines.map((l, i) => (
            <View key={i} style={styles.tr} wrap={false}>
              <Text style={styles.colDesc}>{l.description}</Text>
              <Text style={styles.colQty}>{qf.format(l.quantityHundredths / 100)}</Text>
              <Text style={styles.colNum}>{money(l.unitPriceCents)}</Text>
              <Text style={styles.colVat}>{pf.format(l.vatBps / 10_000)}</Text>
              <Text style={styles.colNum}>{money(l.subtotalCents)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text>{L.subtotal}</Text>
            <Text>{money(data.subtotalCents)}</Text>
          </View>
          {data.vatGroups.map((g) => (
            <View key={g.rateBps} style={styles.totalRow}>
              <Text style={styles.muted}>{`${L.vat} ${pf.format(g.rateBps / 10_000)} (${money(g.baseCents)})`}</Text>
              <Text style={styles.muted}>{money(g.vatCents)}</Text>
            </View>
          ))}
          <View style={styles.grand}>
            <Text>{L.total}</Text>
            <Text>{money(data.totalCents)}</Text>
          </View>
          {data.kind === "quote" && data.depositCents ? (
            <View style={styles.totalRow}>
              <Text style={styles.muted}>{L.deposit}</Text>
              <Text style={styles.muted}>{money(data.depositCents)}</Text>
            </View>
          ) : null}
          {data.kind === "invoice" && data.paidCents ? (
            <>
              <View style={styles.totalRow}>
                <Text style={styles.muted}>{L.alreadyPaid}</Text>
                <Text style={styles.muted}>{money(-data.paidCents)}</Text>
              </View>
              <View style={[styles.totalRow, { fontFamily: "Helvetica-Bold" }]}>
                <Text>{L.toPay}</Text>
                <Text>{money(Math.max(0, data.totalCents - data.paidCents))}</Text>
              </View>
            </>
          ) : null}
        </View>

        {data.notes && (
          <View style={styles.notes}>
            <Text>{data.notes}</Text>
          </View>
        )}

        <Text style={styles.footer} fixed>
          {L.footer}
        </Text>
      </Page>
    </Document>
  );
}
