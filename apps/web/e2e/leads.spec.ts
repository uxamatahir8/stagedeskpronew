import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, signIn } from "./helpers";

const MAILPIT = "http://localhost:8025/api/v1";

/** A date ~5 months ahead as YYYY-MM-DD. */
function futureDate() {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + 5);
  return d.toISOString().slice(0, 10);
}

/** A request on the StageDesk site becomes a lead; the admin offers it to two agencies and the first to accept gets the booking. */
test("a platform lead is offered to agencies and the first to accept gets the booking", async ({ browser, request }) => {
  const run = Date.now().toString(36);
  const name = `Lead Klant ${run}`;
  const email = `lead.${run}@test.local`;
  const visitor = await (await browser.newContext()).newPage();
  const admin = await (await browser.newContext()).newPage();
  const rotterdam = await (await browser.newContext()).newPage();
  const feestband = await (await browser.newContext()).newPage();
  let reference = "";

  await test.step("a visitor sends a request on the StageDesk site", async () => {
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
    await expect
      .poll(async () => (await (await request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:${email}`)}`)).json()).messages_count, { timeout: 15_000 })
      .toBe(1);
  });

  await test.step("the admin offers the lead to two agencies", async () => {
    await signIn(admin, ADMIN_EMAIL);
    await admin.goto(`/nl/app/leads?q=${reference}`);
    await admin.getByRole("link", { name: /Bruiloft/ }).click();
    await expect(admin.getByText(name)).toBeVisible();
    await admin.getByRole("checkbox", { name: /Rotterdam DJ Collectief/ }).check();
    await admin.getByRole("checkbox", { name: /Feestband Utrecht/ }).check();
    await admin.getByRole("button", { name: "Aanbieden aan 2 bureaus" }).click();
    await expect(admin.getByText("Aangeboden aan 2 bureaus.")).toBeVisible();
  });

  await test.step("Rotterdam sees the request without contact details and accepts it", async () => {
    await signIn(rotterdam, "eigenaar@rotterdamdj.local");
    await rotterdam.goto("/nl/app/lead-offers");
    const card = rotterdam.locator('[data-slot="card"]').filter({ hasText: reference });
    await expect(card).toContainText("Rotterdam");
    await expect(card).not.toContainText(email);
    await card.getByRole("button", { name: "Aannemen" }).click();
    await expect(rotterdam).toHaveURL(/\/app\/bookings\/[A-Z2-9]{8}$/);
    await expect(rotterdam.getByText(name).first()).toBeVisible();
  });

  await test.step("Feestband was too late, and the admin sees who has it", async () => {
    await signIn(feestband, "eigenaar@feestband.local");
    await feestband.goto("/nl/app/lead-offers");
    await expect(feestband.getByText(reference)).toHaveCount(0);

    await admin.reload();
    await expect(admin.getByText("Toegewezen aan Rotterdam DJ Collectief")).toBeVisible();
    await expect(admin.getByText("Ingetrokken")).toBeVisible();
  });
});
