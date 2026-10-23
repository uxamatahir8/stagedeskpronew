import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { AffiliatePayout, Invitation, LoginCode, VerifyEmail } from "./templates";

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
});
