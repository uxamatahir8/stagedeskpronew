/** @jsxRuntime automatic */
/** @jsxImportSource react */
// Declared here so every runner (Next, tsx in the worker, Vitest) uses the automatic JSX runtime.
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";
import { copy, type EmailLocale } from "./copy";

const brand = "#5b2a86";

export function EmailLayout({
  locale,
  preview,
  heading,
  children,
}: {
  locale: EmailLocale;
  preview: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <Html lang={locale}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#f6f4fa", fontFamily: "Helvetica, Arial, sans-serif", margin: 0, padding: "32px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 12, maxWidth: 520, padding: "32px 36px" }}>
          <Text style={{ color: brand, fontSize: 14, fontWeight: 700, letterSpacing: 1, margin: 0, textTransform: "uppercase" }}>
            StageDesk
          </Text>
          <Heading style={{ color: "#1b1724", fontSize: 24, lineHeight: "30px", margin: "16px 0 8px" }}>{heading}</Heading>
          {children}
          <Hr style={{ borderColor: "#e2dceb", margin: "28px 0 16px" }} />
          <Text style={{ color: "#6b6378", fontSize: 12, lineHeight: "18px", margin: 0 }}>
            {copy[locale].ignore} {copy[locale].footer}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export function Paragraph({ children }: { children: React.ReactNode }) {
  return <Text style={{ color: "#3a3446", fontSize: 15, lineHeight: "24px", margin: "0 0 20px" }}>{children}</Text>;
}

export function ActionButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Section style={{ margin: "8px 0 20px" }}>
      <Button
        href={href}
        style={{ backgroundColor: brand, borderRadius: 8, color: "#ffffff", fontSize: 15, fontWeight: 600, padding: "12px 20px" }}
      >
        {children}
      </Button>
    </Section>
  );
}

export function LinkFallback({ locale, href }: { locale: EmailLocale; href: string }) {
  return (
    <Text style={{ color: "#6b6378", fontSize: 12, lineHeight: "18px", margin: 0, wordBreak: "break-all" }}>
      {copy[locale].linkFallback} {href}
    </Text>
  );
}
