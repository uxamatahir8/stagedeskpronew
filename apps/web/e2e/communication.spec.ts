import { expect, type APIRequestContext, test } from "@playwright/test";
import { signIn } from "./helpers";

const MAILPIT = "http://localhost:8025";

/** The plain text of the newest email to `to` whose text contains `needle`. */
async function emailText(request: APIRequestContext, to: string, needle: string) {
  let text = "";
  await expect(async () => {
    const search = await (await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)).json();
    for (const m of search.messages ?? []) {
      const full = await (await request.get(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
      if (full.Text.includes(needle)) {
        text = full.Text;
        return;
      }
    }
    throw new Error("not yet");
  }).toPass({ timeout: 30_000 });
  return text;
}

/**
 * Phase 7: a customer and the agency talk in the booking's conversation (with
 * a live notification and an email to the customer), and a support question
 * is answered by the platform admin.
 */
test("customer and agency message each other, and support answers a question", async ({ browser }) => {
  const run = Date.now().toString(36);
  const customer = await (await browser.newContext()).newPage();
  const agency = await (await browser.newContext()).newPage();
  const admin = await (await browser.newContext()).newPage();
  await signIn(agency, "eigenaar@feestband.local");
  await signIn(customer, "sanne@klant.local");

  await test.step("the customer writes to the agency from their event page", async () => {
    await customer.goto("/app/event");
    await customer.getByLabel("Schrijf een bericht").fill(`Kan de DJ om 23:00 stoppen? ${run}`);
    await customer.getByRole("button", { name: "Versturen" }).click();
    await expect(customer.getByText(`Kan de DJ om 23:00 stoppen? ${run}`)).toBeVisible();
  });

  await test.step("the agency gets a live notification and sees it unread in Messages", async () => {
    await agency.goto("/app");
    await expect(agency.getByRole("button", { name: /Meldingen, \d+ ongelezen/ })).toBeVisible({ timeout: 20_000 });
    await agency.goto("/app/messages");
    const row = agency.getByRole("link").filter({ hasText: run });
    await expect(row.getByLabel(/ongelezen/)).toBeVisible();
    await row.click();
    await expect(agency.getByText(`Kan de DJ om 23:00 stoppen? ${run}`)).toBeVisible();
  });

  await test.step("the agency replies; the customer sees it and gets an email through the worker", async () => {
    await agency.getByLabel("Schrijf een bericht").fill(`Ja, dat regelen we. ${run}`);
    await agency.getByRole("button", { name: "Versturen" }).click();
    await expect(agency.getByText(`Ja, dat regelen we. ${run}`)).toBeVisible();

    await customer.reload();
    await expect(customer.getByText(`Ja, dat regelen we. ${run}`)).toBeVisible();
    const mail = await emailText(customer.request, "sanne@klant.local", `Ja, dat regelen we. ${run}`);
    expect(mail).toContain("Feestband Utrecht");
  });

  await test.step("the customer asks support a question", async () => {
    await customer.goto("/app/support");
    await customer.getByRole("button", { name: "Stel een vraag" }).click();
    const dialog = customer.getByRole("dialog");
    await dialog.getByLabel("Onderwerp", { exact: true }).fill(`Factuur aanpassen ${run}`);
    await dialog.getByLabel("Je vraag").fill("Kan het factuuradres worden aangepast naar ons bedrijf?");
    await dialog.getByRole("button", { name: "Versturen" }).click();
    await expect(customer).toHaveURL(/\/app\/support\/T-[A-Z2-9]{6}$/);
    await expect(customer.locator("span").filter({ hasText: "Wacht op support" }).first()).toBeVisible();
  });

  await test.step("the platform admin answers it", async () => {
    await signIn(admin, "admin@stagedesk.local");
    await admin.goto("/app/support");
    await admin.getByRole("link", { name: `Factuur aanpassen ${run}` }).click();
    await admin.getByLabel("Antwoorden").fill("Zeker, dat hebben we aangepast.");
    await admin.getByRole("button", { name: "Antwoord versturen" }).click();
    await expect(admin.getByText("Antwoord verstuurd.")).toBeVisible();

    await customer.reload();
    await expect(customer.getByText("Zeker, dat hebben we aangepast.")).toBeVisible();
    await expect(customer.getByText("Beantwoord", { exact: true })).toBeVisible();
  });
});
