/** @jsxRuntime automatic */
/** @jsxImportSource react */
// Declared here so every runner (Next, tsx in the worker, Vitest) uses the automatic JSX runtime.
import { Text } from "@react-email/components";
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

export function QuoteSent({
  locale,
  name,
  agency,
  total,
  until,
  url,
  accountUrl,
}: {
  locale: EmailLocale;
  name: string;
  agency: string;
  total: string;
  until: string;
  url: string;
  /** Set when the customer has no password yet: where they create their account. */
  accountUrl?: string;
}) {
  const c = copy[locale].quoteSent;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body(name, agency, total, until)}</Paragraph>
      <ActionButton href={url}>{c.button}</ActionButton>
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

export function AffiliateApproved({ locale, name, link, promo, url }: { locale: EmailLocale; name: string; link: string; promo: string; url: string }) {
  const c = copy[locale].affiliateApproved;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body(name, link, promo)}</Paragraph>
      <ActionButton href={url}>{c.button}</ActionButton>
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

export function AgencyCreated({ locale, name, agency, url }: { locale: EmailLocale; name: string; agency: string; url: string }) {
  const c = copy[locale].agencyCreated;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body(name, agency)}</Paragraph>
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
