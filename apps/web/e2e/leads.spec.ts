import { type APIRequestContext, expect, test } from "@playwright/test";
import { ADMIN_EMAIL, signIn } from "./helpers";

const MAILPIT = "http://localhost:8025/api/v1";

/** A date ~5 months ahead as YYYY-MM-DD. */
function futureDate() {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + 5);
  return d.toISOString().slice(0, 10);
}

async function mailText(request: APIRequestContext, to: string, pattern: RegExp) {
  let found = "";
  await expect(async () => {
    const search = await (await request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:${to}`)}`)).json();
    for (const m of search.messages ?? []) {
      const hit = ((await (await request.get(`${MAILPIT}/message/${m.ID}`)).json()).Text as string).match(pattern);
      if (hit) {
        found = hit[1] ?? hit[0];
        break;
      }
    }
    expect(found).not.toBe("");
  }).toPass({ timeout: 20_000 });
  return found;
}

/**
 * A request on the StageDesk site goes out to every provider serving the
 * place (7d08554): Rotterdam DJ Collectief by its city, while Feestband
 * Utrecht only gets it when the admin offers it. Providers send a price
 * without seeing who's asking; the customer compares on their private page
 * and accepts one, which becomes a booking, and the other offers are lost.
 */
test("a platform request reaches the providers in its area, who send prices; the customer books one", async ({ browser, request }) => {
  test.setTimeout(240_000);
  const run = Date.now().toString(36);
  const name = `Lead Klant ${run}`;
  const email = `lead.${run}@test.local`;
  const visitor = await (await browser.newContext()).newPage();
  const admin = await (await browser.newContext()).newPage();
  const rotterdam = await (await browser.newContext()).newPage();
  const feestband = await (await browser.newContext()).newPage();
  let reference = "";
  let customerLink = "";

  await test.step("a visitor sends a request on the StageDesk site and gets a private link", async () => {
    await visitor.goto("/nl/request");
    await expect(visitor.getByRole("heading", { level: 1 })).toContainText("DJ of band");
    await visitor.getByLabel("Datum").fill(futureDate());
    await visitor.getByLabel("Plaats").fill("Rotterdam");
    await visitor.getByLabel("Aantal gasten (optioneel)").fill("150");
    await visitor.getByLabel("Naam", { exact: true }).fill(name);
    // The footer has its own (newsletter) e-mail field.
    await visitor.getByRole("main").getByLabel("E-mailadres").fill(email);
    await visitor.getByLabel("Wil je nog iets kwijt? (optioneel)").fill("Een DJ en een saxofonist, tot 1 uur.");
    await expect(visitor.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 30_000 });
    await visitor.waitForTimeout(3_500);
    await visitor.getByRole("button", { name: "Aanvraag versturen" }).click();
    const sent = visitor.getByText(/referentie L-[A-Z2-9]{6}/);
    await expect(sent).toBeVisible();
    reference = (await sent.textContent())!.match(/L-[A-Z2-9]{6}/)![0];
    customerLink = await mailText(request, email, new RegExp(`(https?://\\S+/request/${reference}\\?t=[\\w-]+)`));
  });

  const card = (page: typeof rotterdam) => page.locator('[data-slot="card"]').filter({ hasText: reference });

  await test.step("Rotterdam DJ Collectief gets it by its city, without the customer's details", async () => {
    await signIn(rotterdam, "eigenaar@rotterdamdj.local");
    // Matching runs after the visitor has their answer.
    await expect(async () => {
      await rotterdam.goto("/nl/app/lead-offers");
      await expect(card(rotterdam)).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await expect(card(rotterdam)).toContainText("Rotterdam");
    await expect(card(rotterdam)).not.toContainText(email);
    await expect(card(rotterdam)).not.toContainText(name);
    // Found by area: send a price or pass, no taking it directly.
    await expect(card(rotterdam).getByRole("button", { name: "Direct aannemen" })).toHaveCount(0);
  });

  await test.step("the admin sees the match and offers it to Feestband Utrecht, which isn't in the area", async () => {
    await signIn(admin, ADMIN_EMAIL);
    await admin.goto(`/nl/app/leads?q=${reference}`);
    await admin.getByRole("link", { name: /Bruiloft/ }).click();
    // The list shows the name too: wait for the lead's own page.
    await expect(admin).toHaveURL(/\/app\/leads\/[\w-]+$/);
    const offers = admin.locator('[data-slot="card"]').filter({ hasText: "Aanbiedingen" });
    await expect(offers).toBeVisible({ timeout: 30_000 });
    await expect(admin.getByText(name).first()).toBeVisible();
    await expect(offers.getByRole("listitem").filter({ hasText: "Rotterdam DJ Collectief" })).toContainText("Gevonden op gebied");
    await expect(offers).not.toContainText("Feestband Utrecht");
    await admin.getByRole("checkbox", { name: /Feestband Utrecht/ }).check();
    await admin.getByRole("button", { name: "Aanbieden aan 1 bureau" }).click();
    await expect(admin.getByText("Aangeboden aan 1 bureau.")).toBeVisible();
    await expect(offers.getByRole("listitem").filter({ hasText: "Feestband Utrecht" })).toContainText("Aangeboden door StageDesk");
  });

  await test.step("Feestband sees the admin's offer, which it could take directly", async () => {
    await signIn(feestband, "eigenaar@feestband.local");
    await feestband.goto("/nl/app/lead-offers");
    await expect(card(feestband).getByRole("button", { name: "Direct aannemen" })).toBeVisible();
  });

  await test.step("Rotterdam sends its price", async () => {
    await rotterdam.reload();
    await card(rotterdam).getByRole("button", { name: "Prijs sturen" }).click();
    const dialog = rotterdam.getByRole("dialog");
    await dialog.getByLabel("Omschrijving 1").fill("DJ-set bruiloft, 5 uur");
    await dialog.getByLabel("Prijs excl. btw 1").fill("800");
    await dialog.getByRole("button", { name: "Prijs sturen" }).click();
    await expect(rotterdam.getByText("Prijs gestuurd.", { exact: false })).toBeVisible();
    await expect(card(rotterdam)).toContainText("Jouw prijs: € 968,00");
  });

  let bookingCode = "";
  await test.step("the customer compares on their private page and books Rotterdam", async () => {
    await visitor.goto(customerLink);
    await expect(visitor.getByText("Rotterdam DJ Collectief").first()).toBeVisible();
    await expect(visitor.getByText("€ 968,00").first()).toBeVisible();
    await visitor.getByRole("button", { name: "Deze prijs accepteren" }).click();
    await visitor.getByRole("dialog").getByRole("button", { name: "Ja, boeken" }).click();
    await expect(visitor.getByText("Je hebt Rotterdam DJ Collectief geboekt").first()).toBeVisible();
    bookingCode = (await visitor.getByText(/Je boeking [A-Z2-9]{8}/).textContent())!.match(/[A-Z2-9]{8}/)![0];
  });

  await test.step("Rotterdam has the booking with the customer; Feestband's offer is gone; the admin sees who has it", async () => {
    await rotterdam.goto(`/nl/app/bookings/${bookingCode}`);
    await expect(rotterdam.getByText(name).first()).toBeVisible();
    await expect(rotterdam.getByText("Offerte geaccepteerd", { exact: false }).first()).toBeVisible();

    await feestband.reload();
    await expect(feestband.getByText(reference)).toHaveCount(0);

    await admin.reload();
    await expect(admin.getByText("Toegewezen aan Rotterdam DJ Collectief")).toBeVisible();
    const offers = admin.locator('[data-slot="card"]').filter({ hasText: "Aanbiedingen" });
    await expect(offers.getByRole("listitem").filter({ hasText: "Feestband Utrecht" })).toContainText("Niet gekozen");
    await expect(offers.getByRole("listitem").filter({ hasText: "Rotterdam DJ Collectief" })).toContainText("Aangenomen");
  });
});
