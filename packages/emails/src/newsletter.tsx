/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Body, Container, Head, Heading, Hr, Html, Img, Link, Markdown, Preview, Section, Text } from "@react-email/components";
import type { EmailLocale } from "./copy";
import { ActionButton, EmailLayout, LinkFallback, Paragraph } from "./layout";

const brand = "#572261";
const magenta = "#d6337f";
const appUrl = process.env["APP_URL"] ?? process.env["BETTER_AUTH_URL"] ?? "http://localhost:3000";

export const newsletterCopy = {
  nl: {
    confirmSubject: "Bevestig je aanmelding voor de StageDesk-nieuwsbrief",
    confirmHeading: "Bijna klaar",
    confirmBody: (name: string | null) => `${name ? `Hoi ${name}, ` : ""}bevestig dat je de StageDesk-nieuwsbrief wilt ontvangen. Heb je je niet aangemeld? Dan kun je deze e-mail negeren.`,
    confirmButton: "Aanmelding bevestigen",
    readMore: "Lees verder",
    why: "Je ontvangt deze nieuwsbrief omdat je je hebt aangemeld op stagedesk.",
    unsubscribe: "Afmelden",
    viewOnline: "Bekijk alle artikelen op de website",
  },
  en: {
    confirmSubject: "Confirm your StageDesk newsletter subscription",
    confirmHeading: "Almost there",
    confirmBody: (name: string | null) => `${name ? `Hi ${name}, ` : ""}please confirm that you'd like to receive the StageDesk newsletter. Didn't sign up? Then you can ignore this email.`,
    confirmButton: "Confirm subscription",
    readMore: "Read more",
    why: "You're receiving this newsletter because you subscribed at stagedesk.",
    unsubscribe: "Unsubscribe",
    viewOnline: "See all articles on the website",
  },
} as const;

export function NewsletterConfirm({ locale, name, url }: { locale: EmailLocale; name: string | null; url: string }) {
  const c = newsletterCopy[locale];
  return (
    <EmailLayout locale={locale} preview={c.confirmSubject} heading={c.confirmHeading}>
      <Paragraph>{c.confirmBody(name)}</Paragraph>
      <ActionButton href={url}>{c.confirmButton}</ActionButton>
      <LinkFallback locale={locale} href={url} />
    </EmailLayout>
  );
}

export interface NewsletterArticle {
  title: string;
  excerpt: string;
  url: string;
  cover: string | null;
}

/** A campaign: the intro (Markdown), the chosen posts as cards, and a one-click unsubscribe. */
export function Newsletter({
  locale,
  subject,
  body,
  articles,
  unsubscribeUrl,
}: {
  locale: EmailLocale;
  subject: string;
  body: string;
  articles: NewsletterArticle[];
  unsubscribeUrl: string;
}) {
  const c = newsletterCopy[locale];
  const abs = (src: string) => (src.startsWith("http") ? src : `${appUrl}${src}`);
  return (
    <Html lang={locale}>
      <Head />
      <Preview>{articles[0]?.title ?? subject}</Preview>
      <Body style={{ backgroundColor: "#f6f4fa", fontFamily: "Helvetica, Arial, sans-serif", margin: 0, padding: "32px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 12, maxWidth: 600, padding: "32px 36px", backgroundImage: `linear-gradient(90deg, ${brand}, ${magenta})`, backgroundSize: "100% 4px", backgroundRepeat: "no-repeat" }}>
          <Img src={`${appUrl}/brand/logo.png`} alt="StageDesk Pro" width="140" height="48" style={{ display: "block", margin: 0 }} />
          <Heading style={{ color: "#1b1724", fontSize: 24, lineHeight: "30px", margin: "16px 0 8px" }}>{subject}</Heading>
          {body.trim() && (
            <Markdown
              markdownCustomStyles={{
                p: { color: "#3a3446", fontSize: 15, lineHeight: "24px", margin: "0 0 16px" },
                h2: { color: "#1b1724", fontSize: 19, margin: "20px 0 8px" },
                link: { color: brand },
                li: { color: "#3a3446", fontSize: 15, lineHeight: "24px" },
              }}
            >
              {body}
            </Markdown>
          )}
          {articles.map((a) => (
            <Section key={a.url} style={{ border: "1px solid #e2dceb", borderRadius: 10, margin: "16px 0", overflow: "hidden" }}>
              {a.cover && <Img src={abs(a.cover)} alt="" width="528" style={{ display: "block", width: "100%", maxWidth: 528, height: "auto" }} />}
              <Section style={{ padding: "14px 18px" }}>
                <Text style={{ color: "#1b1724", fontSize: 17, fontWeight: 700, lineHeight: "23px", margin: "0 0 6px" }}>{a.title}</Text>
                <Text style={{ color: "#3a3446", fontSize: 14, lineHeight: "21px", margin: "0 0 10px" }}>{a.excerpt}</Text>
                <Link href={a.url} style={{ color: brand, fontSize: 14, fontWeight: 600 }}>
                  {c.readMore} →
                </Link>
              </Section>
            </Section>
          ))}
          {articles.length > 0 && (
            <Text style={{ fontSize: 14, margin: "8px 0 0" }}>
              <Link href={`${appUrl}${locale === "nl" ? "/nl" : ""}/blog`} style={{ color: brand }}>
                {c.viewOnline}
              </Link>
            </Text>
          )}
          <Hr style={{ borderColor: "#e2dceb", margin: "28px 0 16px" }} />
          <Text style={{ color: "#6b6378", fontSize: 12, lineHeight: "18px", margin: 0 }}>
            {c.why}{" "}
            <Link href={unsubscribeUrl} style={{ color: "#6b6378", textDecoration: "underline" }}>
              {c.unsubscribe}
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
