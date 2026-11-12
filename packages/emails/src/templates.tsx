/** @jsxRuntime automatic */
/** @jsxImportSource react */
// Declared here so every runner (Next, tsx in the worker, Vitest) uses the automatic JSX runtime.
import { Section, Text } from "@react-email/components";
import { copy, type EmailLocale } from "./copy";
import { ActionButton, EmailLayout, LinkFallback, Paragraph } from "./layout";

export function VerifyEmail({ locale, name, url }: { locale: EmailLocale; name: string; url: string }) {
  const c = copy[locale].verify;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body(name)}</Paragraph>
      <ActionButton href={url}>{c.button}</ActionButton>
      <LinkFallback locale={locale} href={url} />
    </EmailLayout>
  );
}

export function LoginCode({ locale, code }: { locale: EmailLocale; code: string }) {
  const c = copy[locale].code;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body}</Paragraph>
      <Text
        style={{
          backgroundColor: "#f2eff7",
          borderRadius: 8,
          color: "#1b1724",
          fontFamily: "Menlo, Consolas, monospace",
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: 8,
          margin: "0 0 8px",
          padding: "16px 0",
          textAlign: "center",
        }}
      >
        {code}
      </Text>
    </EmailLayout>
  );
}

export function ResetPassword({ locale, name, url }: { locale: EmailLocale; name: string; url: string }) {
  const c = copy[locale].reset;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body(name)}</Paragraph>
      <ActionButton href={url}>{c.button}</ActionButton>
      <LinkFallback locale={locale} href={url} />
    </EmailLayout>
  );
}

export function ArtistAccountSetup({ locale, name, url }: { locale: EmailLocale; name: string; url: string }) {
  const c = copy[locale].artistSetup;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body(name)}</Paragraph>
      <ActionButton href={url}>{c.button}</ActionButton>
      <LinkFallback locale={locale} href={url} />
    </EmailLayout>
  );
}

export function AccountSetup({ locale, name, url }: { locale: EmailLocale; name: string; url: string }) {
  const c = copy[locale].accountSetup;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body(name)}</Paragraph>
      <ActionButton href={url}>{c.button}</ActionButton>
      <LinkFallback locale={locale} href={url} />
    </EmailLayout>
  );
}

export function InquiryReceived({ locale, name, agency, code, url }: { locale: EmailLocale; name: string; agency: string; code: string; url: string }) {
  const c = copy[locale].inquiryReceived;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body(name, agency, code)}</Paragraph>
      <Paragraph>{c.follow}</Paragraph>
      <ActionButton href={url}>{c.button}</ActionButton>
    </EmailLayout>
  );
}

export function NewInquiry({ locale, customer, event, date, url }: { locale: EmailLocale; customer: string; event: string; date: string; url: string }) {
  const c = copy[locale].newInquiry;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body(customer, event, date)}</Paragraph>
      <ActionButton href={url}>{c.button}</ActionButton>
      <LinkFallback locale={locale} href={url} />
    </EmailLayout>
  );
}

/** One line of a quote as the customer sees it; every amount is formatted by the sender from the saved quote. */
export interface QuoteEmailLine {
  description: string;
  quantity: string;
  unitPrice: string;
  total: string;
}

export function QuoteSent({
  locale,
  name,
  agency,
  total,
  until,
  url,
  accountUrl,
  reference,
  event,
  date,
  venue,
  lines,
  subtotal,
  vat,
  deposit,
  balance,
  notes,
  paymentTerms,
  contactEmail,
  contactPhone,
  pdfUrl,
}: {
  locale: EmailLocale;
  name: string;
  agency: string;
  total: string;
  until: string;
  url: string;
  /** Set when the customer has no password yet: where they create their account. */
  accountUrl?: string;
  /** The booking's tracking code. */
  reference?: string;
  event?: string;
  date?: string;
  venue?: string;
  lines?: QuoteEmailLine[];
  subtotal?: string;
  vat?: { label: string; amount: string }[];
  /** Upfront payment; absent when nothing is due upfront. */
  deposit?: string;
  balance?: string;
  notes?: string;
  paymentTerms?: string;
  contactEmail?: string;
  contactPhone?: string;
  pdfUrl?: string;
}) {
  const c = copy[locale].quoteSent;
  const cell = { color: "#3a3446", fontSize: 13, lineHeight: "18px", padding: "6px 0", borderBottom: "1px solid #eee9f3", verticalAlign: "top" } as const;
  const num = { ...cell, textAlign: "right" as const, whiteSpace: "nowrap" as const, paddingLeft: 12 };
  const sum = { color: "#3a3446", fontSize: 13, padding: "3px 0" } as const;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body(name, agency, total, until)}</Paragraph>
      {(reference || event || date || venue) && (
        <Section style={{ backgroundColor: "#f6f4fa", borderRadius: 8, padding: "12px 16px", margin: "0 0 20px" }}>
          {event && <Text style={{ ...sum, margin: 0, fontWeight: 600 }}>{event}</Text>}
          {date && <Text style={{ ...sum, margin: 0 }}>{c.date}: {date}</Text>}
          {venue && <Text style={{ ...sum, margin: 0 }}>{c.venue}: {venue}</Text>}
          {reference && <Text style={{ ...sum, margin: 0 }}>{c.reference}: {reference}</Text>}
        </Section>
      )}
      {lines && lines.length > 0 && (
        <table role="presentation" cellPadding={0} cellSpacing={0} style={{ width: "100%", borderCollapse: "collapse", margin: "0 0 12px" }}>
          <thead>
            <tr>
              <th style={{ ...cell, fontWeight: 600, textAlign: "left" }}>{c.what}</th>
              <th style={{ ...num, fontWeight: 600 }}>{c.quantity}</th>
              <th style={{ ...num, fontWeight: 600 }}>{c.price}</th>
              <th style={{ ...num, fontWeight: 600 }}>{c.amount}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td style={cell}>{l.description}</td>
                <td style={num}>{l.quantity}</td>
                <td style={num}>{l.unitPrice}</td>
                <td style={num}>{l.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {subtotal && (
        <table role="presentation" cellPadding={0} cellSpacing={0} style={{ width: "100%", margin: "0 0 20px" }}>
          <tbody>
            <tr>
              <td style={sum}>{c.subtotal}</td>
              <td style={{ ...sum, textAlign: "right" }}>{subtotal}</td>
            </tr>
            {(vat ?? []).map((v) => (
              <tr key={v.label}>
                <td style={sum}>{v.label}</td>
                <td style={{ ...sum, textAlign: "right" }}>{v.amount}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...sum, fontWeight: 700, fontSize: 15, borderTop: "1px solid #e2dceb", paddingTop: 8 }}>{c.total}</td>
              <td style={{ ...sum, fontWeight: 700, fontSize: 15, borderTop: "1px solid #e2dceb", paddingTop: 8, textAlign: "right" }}>{total}</td>
            </tr>
            {deposit && (
              <tr>
                <td style={sum}>{c.deposit}</td>
                <td style={{ ...sum, textAlign: "right" }}>{deposit}</td>
              </tr>
            )}
            {deposit && balance && (
              <tr>
                <td style={sum}>{c.balance}</td>
                <td style={{ ...sum, textAlign: "right" }}>{balance}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      {subtotal && !deposit && <Paragraph>{c.noDeposit}</Paragraph>}
      {notes && <Paragraph>{notes}</Paragraph>}
      {paymentTerms && <Paragraph>{paymentTerms}</Paragraph>}
      <Paragraph>{c.validUntil(until)}</Paragraph>
      <ActionButton href={url}>{c.button}</ActionButton>
      {pdfUrl && (
        <Paragraph>
          <a href={pdfUrl} style={{ color: "#6d2a7a", fontWeight: 600 }}>
            {c.pdf}
          </a>
        </Paragraph>
      )}
      {(contactEmail || contactPhone) && <Paragraph>{c.contact(agency, [contactEmail, contactPhone].filter(Boolean).join(" · "))}</Paragraph>}
      {accountUrl && (
        <Paragraph>
          {c.account}{" "}
          <a href={accountUrl} style={{ color: "#6d2a7a", fontWeight: 600 }}>
            {c.accountLink}
          </a>
        </Paragraph>
      )}
      <LinkFallback locale={locale} href={url} />
    </EmailLayout>
  );
}

export function Invitation({
  locale,
  agency,
  inviter,
  role,
  url,
}: {
  locale: EmailLocale;
  agency: string;
  inviter: string;
  role: string;
  url: string;
}) {
  const c = copy[locale].invitation;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading(agency)}>
      <Paragraph>{c.body(inviter, agency, role)}</Paragraph>
      <ActionButton href={url}>{c.button}</ActionButton>
      <LinkFallback locale={locale} href={url} />
    </EmailLayout>
  );
}

/** `setup`: the partner's account is new and `url` is their one-time password setup link. */
export function AffiliateApproved({ locale, name, link, promo, url, setup = false }: { locale: EmailLocale; name: string; link: string; promo: string; url: string; setup?: boolean }) {
  const c = copy[locale].affiliateApproved;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{setup ? c.bodySetup(name, link, promo) : c.body(name, link, promo)}</Paragraph>
      <ActionButton href={url}>{setup ? c.buttonSetup : c.button}</ActionButton>
      <LinkFallback locale={locale} href={url} />
    </EmailLayout>
  );
}

export function AffiliatePayout({
  locale,
  name,
  amount,
  lines,
  url,
}: {
  locale: EmailLocale;
  name: string;
  amount: string;
  /** One line per commission, e.g. "Feestband Utrecht · invoice 15 Oct · €37.25". */
  lines: string[];
  url: string;
}) {
  const c = copy[locale].affiliatePayout;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body(name, amount, lines.length)}</Paragraph>
      {lines.map((line) => (
        <Text key={line} style={{ margin: "0 0 4px", fontSize: "14px" }}>
          {line}
        </Text>
      ))}
      <ActionButton href={url}>{c.button}</ActionButton>
      <LinkFallback locale={locale} href={url} />
    </EmailLayout>
  );
}

export function NewMessage({ locale, name, code, excerpt, url }: { locale: EmailLocale; name: string; code: string; excerpt: string; url: string }) {
  const c = copy[locale].newMessage;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body(name, code)}</Paragraph>
      <Text style={{ margin: "0 0 16px", padding: "12px 16px", borderLeft: "3px solid #7c3aed", background: "#f6f4fb", whiteSpace: "pre-line" }}>{excerpt}</Text>
      <ActionButton href={url}>{c.button}</ActionButton>
      <LinkFallback locale={locale} href={url} />
    </EmailLayout>
  );
}

export function EventReminder({ locale, days, name, event, date, agency, url }: { locale: EmailLocale; days: number; name: string; event: string; date: string; agency: string; url: string }) {
  const c = copy[locale].eventReminder;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading(days)}>
      <Paragraph>{c.body(name, event, date, agency)}</Paragraph>
      <ActionButton href={url}>{c.button}</ActionButton>
      <LinkFallback locale={locale} href={url} />
    </EmailLayout>
  );
}

export function GigReminder({ locale, name, event, date, venue, url }: { locale: EmailLocale; name: string; event: string; date: string; venue: string; url: string }) {
  const c = copy[locale].gigReminder;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body(name, event, date, venue)}</Paragraph>
      <ActionButton href={url}>{c.button}</ActionButton>
      <LinkFallback locale={locale} href={url} />
    </EmailLayout>
  );
}

export function QuoteExpiring({ locale, name, agency, until, url }: { locale: EmailLocale; name: string; agency: string; until: string; url: string }) {
  const c = copy[locale].quoteExpiring;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body(name, agency, until)}</Paragraph>
      <ActionButton href={url}>{c.button}</ActionButton>
      <LinkFallback locale={locale} href={url} />
    </EmailLayout>
  );
}

export function BalanceDue({ locale, name, amount, date, agency, url }: { locale: EmailLocale; name: string; amount: string; date: string; agency: string; url: string }) {
  const c = copy[locale].balanceDue;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body(name, amount, date, agency)}</Paragraph>
      <ActionButton href={url}>{c.button}</ActionButton>
      <LinkFallback locale={locale} href={url} />
    </EmailLayout>
  );
}

export function TicketReply({ locale, name, subject, excerpt, url }: { locale: EmailLocale; name: string; subject: string; excerpt: string; url: string }) {
  const c = copy[locale].ticketReply;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body(name, subject)}</Paragraph>
      <Text style={{ margin: "0 0 16px", padding: "12px 16px", borderLeft: "3px solid #7c3aed", background: "#f6f4fb", whiteSpace: "pre-line" }}>{excerpt}</Text>
      <ActionButton href={url}>{c.button}</ActionButton>
      <LinkFallback locale={locale} href={url} />
    </EmailLayout>
  );
}

export function ContactMessage({ locale, name, email, company, message }: { locale: EmailLocale; name: string; email: string; company: string; message: string }) {
  const c = copy[locale].contactMessage;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body(name, email, company)}</Paragraph>
      <Text style={{ margin: "0 0 16px", padding: "12px 16px", borderLeft: "3px solid #7c3aed", background: "#f6f4fb", whiteSpace: "pre-line" }}>{message}</Text>
    </EmailLayout>
  );
}

/** `setup`: the owner's account is new and `url` is their one-time password setup link. */
export function AgencyCreated({ locale, name, agency, url, setup = false }: { locale: EmailLocale; name: string; agency: string; url: string; setup?: boolean }) {
  const c = copy[locale].agencyCreated;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{setup ? c.bodySetup(name, agency) : c.body(name, agency)}</Paragraph>
      <ActionButton href={url}>{setup ? c.buttonSetup : c.button}</ActionButton>
      <LinkFallback locale={locale} href={url} />
    </EmailLayout>
  );
}

/** An agency or an artist asks someone to start an agency on StageDesk. `agency` is the inviting agency (null for an artist). */
export function AgencyInvite({ locale, inviter, agency, url }: { locale: EmailLocale; inviter: string; agency: string | null; url: string }) {
  const c = copy[locale].agencyInvite;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{agency ? c.bodyAgency(inviter, agency) : c.bodyArtist(inviter)}</Paragraph>
      <ActionButton href={url}>{c.button}</ActionButton>
      <LinkFallback locale={locale} href={url} />
    </EmailLayout>
  );
}

export function LeadReceived({ locale, name, reference, url }: { locale: EmailLocale; name: string; reference: string; url: string }) {
  const c = copy[locale].leadReceived;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body(name, reference)}</Paragraph>
      <ActionButton href={url}>{c.button}</ActionButton>
    </EmailLayout>
  );
}

export function LeadOffer({ locale, agency, event, date, city, url }: { locale: EmailLocale; agency: string; event: string; date: string; city: string; url: string }) {
  const c = copy[locale].leadOffer;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body(agency, event, date, city)}</Paragraph>
      <ActionButton href={url}>{c.button}</ActionButton>
      <LinkFallback locale={locale} href={url} />
    </EmailLayout>
  );
}

export function ArtistRequest({ locale, status, other, artist, event, fee, url }: { locale: EmailLocale; status: string; other: string; artist: string; event: string; fee: string; url: string }) {
  const c = copy[locale].artistRequest;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading(status)}>
      <Paragraph>{c.body(status, other, artist, event, fee)}</Paragraph>
      <ActionButton href={url}>{c.button}</ActionButton>
    </EmailLayout>
  );
}

export function LeadQuote({ locale, name, provider, event, total, url }: { locale: EmailLocale; name: string; provider: string; event: string; total: string; url: string }) {
  const c = copy[locale].leadQuote;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body(name, provider, event, total)}</Paragraph>
      <ActionButton href={url}>{c.button}</ActionButton>
      <LinkFallback locale={locale} href={url} />
    </EmailLayout>
  );
}

export function LeadWon({ locale, name, event, code, url }: { locale: EmailLocale; name: string; event: string; code: string; url: string }) {
  const c = copy[locale].leadWon;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body(name, event, code)}</Paragraph>
      <ActionButton href={url}>{c.button}</ActionButton>
    </EmailLayout>
  );
}

export function LeadLost({ locale, event, reference, url }: { locale: EmailLocale; event: string; reference: string; url: string }) {
  const c = copy[locale].leadLost;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body(event, reference)}</Paragraph>
      <ActionButton href={url}>{c.button}</ActionButton>
    </EmailLayout>
  );
}

export function PaymentReceipt({
  locale,
  name,
  agency,
  code,
  amount,
  method,
  date,
  paid,
  remaining,
  url,
}: {
  locale: EmailLocale;
  name: string;
  agency: string;
  code: string;
  amount: string;
  method: string;
  date: string;
  paid: string;
  remaining: string;
  url: string;
}) {
  const c = copy[locale].paymentReceipt;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body(name, amount, agency, code)}</Paragraph>
      <Paragraph>
        {c.method}: {method}
        <br />
        {c.date}: {date}
        <br />
        {c.paid}: {paid}
        <br />
        {c.remaining}: {remaining}
      </Paragraph>
      <ActionButton href={url}>{c.button}</ActionButton>
    </EmailLayout>
  );
}

export function PaymentNotReceived({ locale, name, agency, amount, reason, url }: { locale: EmailLocale; name: string; agency: string; amount: string; reason: string; url: string }) {
  const c = copy[locale].paymentNotReceived;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body(name, amount, agency)}</Paragraph>
      {reason && (
        <Paragraph>
          {c.reason}: {reason}
        </Paragraph>
      )}
      <Paragraph>{c.after}</Paragraph>
      <ActionButton href={url}>{c.button}</ActionButton>
    </EmailLayout>
  );
}

export function PaymentReported({ locale, customer, amount, method, code, url }: { locale: EmailLocale; customer: string; amount: string; method: string; code: string; url: string }) {
  const c = copy[locale].paymentReported;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body(customer, amount, method, code)}</Paragraph>
      <ActionButton href={url}>{c.button}</ActionButton>
      <LinkFallback locale={locale} href={url} />
    </EmailLayout>
  );
}

/** An agency put the artist on a booking (request), took them off it, or the booking was cancelled. */
export function GigAssigned({
  locale,
  status,
  name,
  agency,
  event,
  date,
  venue,
  url,
  setupUrl,
}: {
  locale: EmailLocale;
  status: "new" | "withdrawn" | "cancelled";
  name: string;
  agency: string;
  event: string;
  date: string;
  venue: string;
  url: string;
  /** For an artist without a password yet: where they choose one first. */
  setupUrl?: string;
}) {
  const c = copy[locale].gigAssigned;
  return (
    <EmailLayout locale={locale} preview={c.preview[status]} heading={c.heading[status]}>
      <Paragraph>{c.body[status](name, agency, event, date, venue)}</Paragraph>
      {status === "new" && (
        <>
          <ActionButton href={setupUrl ?? url}>{setupUrl ? c.setupButton : c.button}</ActionButton>
          {setupUrl && <Paragraph>{c.setupHint}</Paragraph>}
          <LinkFallback locale={locale} href={setupUrl ?? url} />
        </>
      )}
    </EmailLayout>
  );
}

/** The agency asks the customer to fill in the event details through a private link. */
export function BookingDetailsRequest({ locale, name, agency, message, until, url }: { locale: EmailLocale; name: string; agency: string; message?: string; until: string; url: string }) {
  const c = copy[locale].detailsRequest;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body(name, agency)}</Paragraph>
      {message && <Paragraph>{message}</Paragraph>}
      <ActionButton href={url}>{c.button}</ActionButton>
      <Paragraph>{c.until(until)}</Paragraph>
      <LinkFallback locale={locale} href={url} />
    </EmailLayout>
  );
}

/** The agency's answer to a change the customer asked for on their event. */
export function ChangeDecision({ locale, name, agency, code, event, approved, changes, details, note, contact, url }: { locale: EmailLocale; name: string; agency: string; code: string; event: string; approved: boolean; changes: string[]; details: string[]; note?: string | null; contact?: string | null; url: string }) {
  const c = copy[locale].changeDecision;
  return (
    <EmailLayout locale={locale} preview={c.preview(approved, code)} heading={c.heading(approved)}>
      <Paragraph>{c.body(approved, name, agency, event, code)}</Paragraph>
      <Paragraph>{c.changesTitle(approved)}</Paragraph>
      {changes.map((line) => (
        <Paragraph key={line}>{line}</Paragraph>
      ))}
      {note && <Paragraph>{c.note(agency, note)}</Paragraph>}
      {details.length > 0 && <Paragraph>{c.detailsTitle(approved)}</Paragraph>}
      {details.map((line) => (
        <Paragraph key={line}>{line}</Paragraph>
      ))}
      <ActionButton href={url}>{c.button}</ActionButton>
      {contact && <Paragraph>{c.contact(agency, contact)}</Paragraph>}
      <LinkFallback locale={locale} href={url} />
    </EmailLayout>
  );
}

export type BookingUpdateName = "quoteAccepted" | "artistAccepted" | "artistDeclined" | "bookingConfirmed" | "bookingCancelled" | "invoiceIssued" | "reviewInvitation";

/** A step in a booking, told to the agency's team or the customer. */
export function BookingUpdate({ locale, update, url, name = "", agency = "", customer = "", artist = "", code = "", event = "", date = "", reason = "" }: { locale: EmailLocale; update: BookingUpdateName; url: string; name?: string; agency?: string; customer?: string; artist?: string; code?: string; event?: string; date?: string; reason?: string }) {
  const c = copy[locale].bookingUpdate[update];
  const text = c.body({ name, agency, customer, artist, code, event, date, reason });
  return (
    <EmailLayout locale={locale} preview={text} heading={c.heading}>
      <Paragraph>{text}</Paragraph>
      <ActionButton href={url}>{c.button}</ActionButton>
      <LinkFallback locale={locale} href={url} />
    </EmailLayout>
  );
}

/** Sent from the agency settings to check how customer emails arrive. */
export function SenderTest({ locale, agency, replyTo }: { locale: EmailLocale; agency: string; replyTo: string }) {
  const c = copy[locale].senderTest;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body(agency, replyTo)}</Paragraph>
    </EmailLayout>
  );
}
