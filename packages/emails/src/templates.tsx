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
