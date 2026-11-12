import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { emailSamples, type EmailJob, fromHeader, previewEmailJob } from "./index";
import { AffiliateApproved, AffiliatePayout, Invitation, LoginCode, VerifyEmail } from "./templates";

describe("email templates", () => {
  it("renders the verification link in both languages", async () => {
    const url = "http://localhost:3000/api/auth/verify-email?token=abc";
    const nl = await render(<VerifyEmail locale="nl" name="Sanne" url={url} />);
    const en = await render(<VerifyEmail locale="en" name="Sanne" url={url} />);
    expect(nl).toContain("Bevestig je e-mailadres");
    expect(en).toContain("Confirm your email address");
    expect(nl).toContain(url.replace("&", "&amp;"));
  });

  it("shows the sign-in code", async () => {
    const text = await render(<LoginCode locale="en" code="482913" />, { plainText: true });
    expect(text).toContain("482913");
  });

  it("names the agency and role in invitations", async () => {
    const text = await render(
      <Invitation locale="nl" agency="Feestband Utrecht" inviter="Mark" role="artiest" url="http://x/y" />,
      { plainText: true },
    );
    expect(text).toContain("Feestband Utrecht");
    expect(text).toContain("als artiest");
  });

  it("lists every commission on a payout statement", async () => {
    const text = await render(
      <AffiliatePayout locale="en" name="Pim" amount="€74.50" lines={["Feestband Utrecht · €37.25", "Rotterdam DJ Collectief · €37.25"]} url="http://x/app/payouts" />,
      { plainText: true },
    );
    expect(text).toContain("2 approved commissions");
    expect(text).toContain("Rotterdam DJ Collectief · €37.25");
  });

  it("sends a partner without a password to the setup link, others to sign in", async () => {
    const setup = await render(
      <AffiliateApproved locale="nl" name="Pim" link="http://x/?via=pim" promo="PIM20" url="http://x/nl/reset-password?token=t&setup=1" setup />,
      { plainText: true },
    );
    expect(setup).toContain("Wachtwoord kiezen");
    expect(setup).toContain("Kies binnen 24 uur je wachtwoord");
    const signIn = await render(<AffiliateApproved locale="en" name="Pim" link="http://x/?via=pim" promo="PIM20" url="http://x/sign-in" />, { plainText: true });
    expect(signIn).toContain("Open your partner dashboard");
    expect(signIn).not.toContain("password");
  });
});

describe("email previews", () => {
  it("renders every email from its sample in both languages without sending", async () => {
    for (const locale of ["nl", "en"] as const) {
      const samples = emailSamples(locale, "http://localhost:3000");
      for (const [kind, params] of Object.entries(samples)) {
        const email = await previewEmailJob({ kind, to: "preview@example.com", params } as EmailJob);
        expect(email.subject, `${locale} ${kind}`).not.toBe("");
        expect(email.html, `${locale} ${kind}`).toContain("StageDesk");
      }
    }
  });
});

describe("test addresses", async () => {
  const { isTestAddress, localMailTransport } = await import("./index");
  it("recognises test and demo addresses", () => {
    for (const email of ["a@test.local", "eigenaar@feestband.local", "x@e2e-bureau.nl", "y@foo.test", "z@example.example", "q@host.invalid"]) {
      expect(isTestAddress(email)).toBe(true);
    }
    for (const email of ["sanne@gmail.com", "info@stagedeskpro.com", "a@e2e.nl", "b@bureau-e2e-x.nl"]) expect(isTestAddress(email)).toBe(false);
  });
  it("treats only this machine and Mailpit as local", () => {
    expect(localMailTransport("localhost")).toBe(true);
    expect(localMailTransport("mailpit")).toBe(true);
    expect(localMailTransport("smtp.strato.com")).toBe(false);
  });
});

describe("quote email content", () => {
  it("lists what the customer gets, with the saved amounts, in Dutch and English", async () => {
    for (const locale of ["nl", "en"] as const) {
      const job = { kind: "quote", to: "x@test.local", params: emailSamples(locale, "http://localhost:3000").quote } as EmailJob;
      const { subject, text } = await previewEmailJob(job);
      expect(subject).toContain("Feestband Utrecht");
      for (const part of ["K7Q2M9XA", "Kasteel de Haar", "€ 750,00", "€ 145,00", "€ 895,00", "€ 187,95", "€ 1.082,95", "€ 324,89", "€ 758,06", "info@feestband.nl"]) {
        expect(text).toContain(part);
      }
      expect(text).toContain(locale === "nl" ? "Aanbetaling bij akkoord" : "Deposit on acceptance");
      expect(text).toContain(locale === "nl" ? "geldig tot en met" : "valid until");
    }
  });

  it("says no deposit is needed when there is none", async () => {
    const params = { ...emailSamples("nl", "http://x").quote, deposit: undefined, balance: undefined };
    const { text } = await previewEmailJob({ kind: "quote", to: "x@test.local", params } as EmailJob);
    expect(text).toContain("geen aanbetaling");
    expect(text).not.toContain("Aanbetaling bij akkoord");
  });
});

describe("agency sender identity", () => {
  it("shows the agency's name but keeps the platform's verified address", () => {
    expect(fromHeader({ name: "Feestband Utrecht" }, "StageDesk <no-reply@stagedesk.nl>")).toBe('"Feestband Utrecht via StageDesk" <no-reply@stagedesk.nl>');
    expect(fromHeader(undefined, "StageDesk <no-reply@stagedesk.nl>")).toBe("StageDesk <no-reply@stagedesk.nl>");
  });

  it("can't be used to inject headers or another address", () => {
    const header = fromHeader({ name: 'Evil" <ceo@bank.com>\r\nBcc: all@x.com' }, "StageDesk <no-reply@stagedesk.nl>");
    expect(header.endsWith("<no-reply@stagedesk.nl>")).toBe(true);
    expect(header).not.toMatch(/[\r\n]/);
    expect(header.match(/</g)).toHaveLength(1);
  });

  it("renders the new artist, details-request and test emails in both languages", async () => {
    for (const locale of ["nl", "en"] as const) {
      const samples = emailSamples(locale, "http://x");
      for (const kind of ["gigAssigned", "bookingDetailsRequest", "senderTest"] as const) {
        const { subject, text } = await previewEmailJob({ kind, to: "x@test.local", params: samples[kind] } as EmailJob);
        expect(subject.length).toBeGreaterThan(5);
        expect(text).toContain("Feestband Utrecht");
      }
    }
  });
});
