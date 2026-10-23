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
}: {
  locale: EmailLocale;
  name: string;
  agency: string;
  total: string;
  until: string;
  url: string;
}) {
  const c = copy[locale].quoteSent;
  return (
    <EmailLayout locale={locale} preview={c.preview} heading={c.heading}>
      <Paragraph>{c.body(name, agency, total, until)}</Paragraph>
      <ActionButton href={url}>{c.button}</ActionButton>
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
