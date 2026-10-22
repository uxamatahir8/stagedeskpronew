import { expect, test } from "@playwright/test";
import { signIn, todayNl } from "./helpers";

/**
 * Phase 3 acceptance: an agency takes a booking from inquiry to completed
 * (and settled) with a quote, using offline payments. The event is today so
 * it can be completed in the same run.
 */
test("agency takes a booking from inquiry to settled with a quote and offline payments", async ({ browser }) => {
  const run = Date.now().toString(36);
  const agency = await (await browser.newContext()).newPage();
  const artist = await (await browser.newContext()).newPage();

  await test.step("owner records an inquiry for a new customer", async () => {
    await signIn(agency, "eigenaar@feestband.local");
    await agency.goto("/app/bookings/new");
    await agency.getByRole("tab", { name: "Nieuwe klant" }).click();
    await agency.getByLabel("Je naam").fill(`E2E Klant ${run}`);
    await agency.getByLabel("E-mailadres").fill(`klant.${run}@test.local`);
    await agency.getByLabel("Datum").fill(todayNl());
    await agency.getByLabel("Naam locatie").fill("Theater Kikker");
    await agency.getByLabel("Plaats").fill("Utrecht");
    await agency.getByRole("button", { name: "Boeking aanmaken" }).click();
    await expect(agency).toHaveURL(/\/app\/bookings\/[A-Z2-9]{8}$/);
    await expect(agency.getByText("Aanvraag", { exact: true }).first()).toBeVisible();
  });
  const code = agency.url().split("/").pop()!;

  await test.step("owner builds and sends a quote from the service catalog", async () => {
    await agency.getByRole("button", { name: "Offerte maken" }).click();
    await agency.getByRole("button", { name: "Toevoegen uit diensten" }).click();
    await agency.getByRole("menuitem", { name: /DJ, per uur/ }).click();
    await agency.getByLabel("Aantal 1").fill("5");
    await expect(agency.getByText("€ 756,25").first()).toBeVisible();
    await agency.getByRole("button", { name: "Offerte versturen" }).click();
    await expect(agency.getByText("Offerte versie 1 verstuurd.")).toBeVisible();
    await expect(agency.getByText("Offerte verstuurd", { exact: true }).first()).toBeVisible();
  });

  await test.step("customer agrees by phone; owner accepts on their behalf", async () => {
    await agency.getByRole("button", { name: "Namens klant accepteren" }).click();
    await agency.getByRole("dialog").getByRole("button", { name: "Offerte accepteren" }).click();
    await expect(agency.getByText("Geboekt", { exact: true }).first()).toBeVisible();
  });

  await test.step("owner asks DJ Sem to perform", async () => {
    await agency.getByRole("combobox", { name: "Kies een artiest" }).click();
    await agency.getByRole("option", { name: /^DJ Sem/ }).click();
    await agency.getByRole("button", { name: /Artiest toewijzen|Andere artiest/ }).click();
    await expect(agency.getByText("Verzoek verstuurd naar DJ Sem.")).toBeVisible();
  });

  await test.step("DJ Sem accepts the gig", async () => {
    await signIn(artist, "dj.sem@feestband.local");
    await artist.goto(`/app/gigs/${code}`);
    await expect(artist.getByText("Theater Kikker, Utrecht")).toBeVisible();
    await artist.getByRole("button", { name: "Optreden accepteren" }).click();
    await expect(artist.getByText("Optreden geaccepteerd.")).toBeVisible();
  });

  await test.step("owner records the deposit and creates the invoice", async () => {
    await agency.reload();
    await expect(agency.getByText("Bevestigd", { exact: true }).first()).toBeVisible();
    await agency.getByRole("button", { name: "Betaling vastleggen" }).click();
    const dialog = agency.getByRole("dialog");
    await dialog.getByLabel("Bedrag (€)").fill("226,88");
    await dialog.getByRole("button", { name: "Betaling vastleggen" }).click();
    await expect(agency.getByText("Betaling vastgelegd.")).toBeVisible();
    await expect(agency.getByText("Aanbetaling ontvangen").first()).toBeVisible();

    await agency.getByRole("button", { name: "Factuur maken" }).click();
    await expect(agency.getByText(/Factuur \d{4}-\d{4} aangemaakt\./)).toBeVisible();
  });

  await test.step("after the event the owner completes the booking", async () => {
    await agency.getByRole("button", { name: "Markeren als afgerond" }).click();
    await agency.getByRole("dialog").getByRole("button", { name: "Markeren als afgerond" }).click();
    await expect(agency.getByText("Afgerond", { exact: true }).first()).toBeVisible();
  });

  await test.step("the balance comes in by bank transfer and the booking is settled", async () => {
    await agency.getByRole("button", { name: "Betaling vastleggen" }).click();
    const dialog = agency.getByRole("dialog");
    await dialog.getByLabel("Bedrag (€)").fill("529,37");
    await dialog.getByRole("button", { name: "Betaling vastleggen" }).click();
    await expect(agency.getByText("Betaald", { exact: true }).first()).toBeVisible();

    await agency.getByRole("button", { name: "Markeren als afgerekend" }).click();
    await agency.getByRole("dialog").getByRole("button", { name: "Markeren als afgerekend" }).click();
    await expect(agency.getByText("Afgerekend", { exact: true }).first()).toBeVisible();
    await expect(agency.getByText("Gemarkeerd als afgerekend")).toBeVisible();
  });

  await test.step("the invoice PDF downloads", async () => {
    const link = agency.getByRole("link", { name: /Factuur \d{4}-\d{4}/ });
    const href = await link.getAttribute("href");
    const response = await agency.request.get(href!);
    expect(response.headers()["content-type"]).toBe("application/pdf");
  });

  await test.step("part of the bank transfer is refunded and recorded", async () => {
    await agency.getByRole("button", { name: "Terugbetalen" }).last().click();
    const dialog = agency.getByRole("dialog");
    await dialog.getByLabel("Bedrag").fill("10,00");
    await dialog.getByRole("button", { name: "Terugbetalen" }).click();
    await expect(agency.getByText("€ 10,00 terugbetaald.")).toBeVisible();
    await expect(agency.getByText("−€ 10,00").first()).toBeVisible();
  });
});
