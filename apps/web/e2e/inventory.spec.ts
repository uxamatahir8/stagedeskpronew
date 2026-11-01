import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * Equipment inventory from the agency's side, the assigned DJ's side and
 * another agency's side: equipment and a package, a packing list reserved
 * when the quote is accepted, a second gig that can't reserve the same
 * speaker, loading, damage, missing → lost → found, and read-only sharing.
 * Codes start with E2E- so `pnpm db:clean-test --yes` removes them.
 */

const run = Date.now().toString(36).toUpperCase();
const SPK = `E2E-SPK-${run}`;
const XLR = `E2E-XLR-${run}`;
const category = `E2E ${run}`;
// Both bookings on the same day, 6 to 46 weeks ahead and different per run (DJ Sem is booked on earlier runs' dates).
const days = 42 + (Math.floor(Date.now() / 60_000) % 280);
const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date(Date.now() + days * 86_400_000));

async function choose(page: Page, combobox: string | RegExp, option: string | RegExp) {
  await page.getByRole("combobox", { name: combobox }).click();
  await page.getByRole("option", { name: option }).first().click();
}

/** A new inquiry for a test customer; returns its code. */
async function newInquiry(page: Page, name: string) {
  await page.goto("/nl/app/bookings/new");
  await page.getByRole("tab", { name: "Nieuwe klant" }).click();
  await page.getByLabel("Je naam").fill(name);
  await page.getByLabel("E-mailadres").fill(`${name.toLowerCase().replace(/\W+/g, ".")}@test.local`);
  await page.getByLabel("Datum").fill(date);
  await page.getByLabel("Naam locatie").fill("Tivoli");
  await page.getByLabel("Plaats").fill("Utrecht");
  await page.getByRole("button", { name: "Boeking aanmaken" }).click();
  await expect(page).toHaveURL(/\/app\/bookings\/[A-Z2-9]{8}$/);
  return page.url().split("/").pop()!;
}

/** Sends a quote and accepts it on the customer's behalf: the booking becomes booked. */
async function accept(page: Page, code: string) {
  await page.goto(`/nl/app/bookings/${code}`);
  await page.getByRole("button", { name: "Offerte maken" }).click();
  await page.getByRole("button", { name: "Toevoegen uit diensten" }).click();
  await page.getByRole("menuitem", { name: /DJ, per uur/ }).click();
  await page.getByRole("button", { name: "Offerte versturen" }).click();
  await expect(page.getByText("Offerte versie 1 verstuurd.")).toBeVisible();
  await page.getByRole("button", { name: "Namens klant accepteren" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Offerte accepteren" }).click();
  await expect(page.getByText("Geboekt", { exact: true }).first()).toBeVisible();
}

async function addToList(page: Page, code: string, item: RegExp) {
  await page.goto(`/nl/app/bookings/${code}/equipment`);
  await choose(page, "Kies apparatuur…", item);
  await page.getByRole("button", { name: "Toevoegen", exact: true }).click();
  await expect(page.getByText(/toegevoegd/).first()).toBeVisible();
}

async function saveInventorySettings(page: Page, sharing: boolean, artists: boolean) {
  await page.goto("/nl/app/agency-settings");
  const card = page.locator('[data-slot="card"]').filter({ hasText: "Inventaris delen met andere bureaus" });
  await card.getByRole("switch", { name: "Inventaris delen met andere bureaus" }).setChecked(sharing);
  await card.getByRole("switch", { name: /Toegewezen artiesten/ }).setChecked(artists);
  const save = card.getByRole("button", { name: "Opslaan" });
  if (await save.isEnabled()) {
    await save.click();
    await expect(page.getByText("Instellingen opgeslagen.")).toBeVisible();
  }
}

test("equipment from inventory to packing list, loading, check-in and sharing", async ({ browser }) => {
  test.setTimeout(420_000);
  const owner = await (await browser.newContext()).newPage();
  const dj = await (await browser.newContext()).newPage();
  const other = await (await browser.newContext()).newPage();
  const staff = await (await browser.newContext()).newPage();
  owner.on("dialog", (d) => d.accept());

  await test.step("owner adds a category, a speaker and counted cables", async () => {
    await signIn(owner, "eigenaar@feestband.local");
    await owner.goto("/nl/app/inventory/categories");
    await owner.getByPlaceholder("Nieuwe categorie").fill(category);
    await owner.getByRole("button", { name: "Toevoegen" }).click();
    await expect(owner.getByText(category)).toBeVisible();

    await owner.goto("/nl/app/inventory");
    await owner.getByRole("button", { name: "Apparatuur toevoegen" }).click();
    const dialog = owner.getByRole("dialog");
    await dialog.getByLabel("Nummer", { exact: true }).fill(SPK.toLowerCase());
    await dialog.getByLabel("Naam", { exact: true }).fill("E2E topspeaker");
    await choose(owner, "Categorie", category);
    await dialog.getByLabel("Serienummer").fill("SECRET-SERIAL-1");
    await dialog.getByRole("button", { name: "Opslaan" }).click();
    await expect(owner).toHaveURL(/\/app\/inventory\/[\w-]+$/);
    await expect(owner.getByText(SPK).first()).toBeVisible();

    await owner.goto("/nl/app/inventory");
    await owner.getByRole("button", { name: "Apparatuur toevoegen" }).click();
    await dialog.getByLabel("Nummer", { exact: true }).fill(XLR);
    await dialog.getByLabel("Naam", { exact: true }).fill("E2E XLR-kabel");
    await choose(owner, "Bijhouden als", "Getelde voorraad");
    await dialog.getByLabel("Aantal", { exact: true }).fill("10");
    await dialog.getByRole("button", { name: "Opslaan" }).click();
    await expect(owner).toHaveURL(/\/app\/inventory\/[\w-]+$/);

    // The same number twice is refused.
    await owner.goto("/nl/app/inventory");
    await owner.getByRole("button", { name: "Apparatuur toevoegen" }).click();
    await dialog.getByLabel("Nummer", { exact: true }).fill(XLR);
    await dialog.getByLabel("Naam", { exact: true }).fill("Dubbel");
    await dialog.getByRole("button", { name: "Opslaan" }).click();
    await expect(owner.getByText("Een ander item heeft dat nummer al.")).toBeVisible();
  });

  await test.step("owner saves a package", async () => {
    await owner.goto("/nl/app/inventory/packages/new");
    await owner.getByLabel("Naam", { exact: true }).fill(`E2E pakket ${run}`);
    await owner.getByRole("button", { name: "Regel toevoegen" }).click();
    await choose(owner, "Apparatuur of categorie", `Willekeurig: ${category}`);
    await owner.getByRole("button", { name: "Regel toevoegen" }).click();
    await owner.getByRole("combobox", { name: "Apparatuur of categorie" }).nth(1).click();
    await owner.getByRole("option", { name: new RegExp(XLR) }).click();
    await owner.getByRole("spinbutton", { name: "Aantal" }).nth(1).fill("4");
    await owner.getByRole("button", { name: "Opslaan" }).click();
    await expect(owner).toHaveURL(/\/app\/inventory\/packages\/[\w-]+$/);
  });

  let first = "";
  let second = "";
  await test.step("two inquiries on the same day plan the same speaker; nothing is reserved yet", async () => {
    first = await newInquiry(owner, `E2E Eerste ${run}`);
    await owner.goto(`/nl/app/bookings/${first}/equipment`);
    await choose(owner, "Kies een pakket…", `E2E pakket ${run}`);
    await owner.getByRole("button", { name: "Bekijken" }).click();
    await owner.getByRole("dialog").getByRole("button", { name: /items? toevoegen/ }).click();
    await expect(owner.getByText("2 items toegevoegd.")).toBeVisible();
    await expect(owner.getByText("nog niets gereserveerd", { exact: false })).toBeVisible();

    second = await newInquiry(owner, `E2E Tweede ${run}`);
    await addToList(owner, second, new RegExp(SPK));
  });

  await test.step("accepting the first quote reserves; the second can't, but its acceptance goes through", async () => {
    await accept(owner, first);
    await owner.goto(`/nl/app/bookings/${first}/equipment`);
    await expect(owner.getByText("Niet gereserveerd")).toHaveCount(0);

    await accept(owner, second);
    await owner.goto(`/nl/app/bookings/${second}/equipment`);
    await expect(owner.getByText("1 regel is niet gereserveerd", { exact: false })).toBeVisible();
    await owner.getByRole("button", { name: "Opnieuw reserveren" }).click();
    await expect(owner.getByText(`Nog steeds niet beschikbaar: ${SPK}`, { exact: false })).toBeVisible();
    await owner.getByRole("tab", { name: "Laden" }).click();
    await expect(owner.getByRole("button", { name: "Geladen" })).toBeDisabled();
  });

  await test.step("owner loads the speaker by its number", async () => {
    await owner.goto(`/nl/app/bookings/${first}/equipment`);
    await owner.getByRole("tab", { name: "Laden" }).click();
    await owner.getByPlaceholder("Nummer van de apparatuur").fill(SPK.toLowerCase());
    await owner.getByRole("button", { name: "Laden", exact: true }).click();
    await expect(owner.getByText("1 van 1 geladen")).toBeVisible();
  });

  await test.step("the assigned DJ sees the list, and loads once the agency allows it", async () => {
    await owner.goto(`/nl/app/bookings/${first}`);
    await choose(owner, "Kies een artiest", /^DJ Sem/);
    await owner.getByRole("button", { name: /Artiest toewijzen|Andere artiest/ }).click();
    await expect(owner.getByText("Verzoek verstuurd naar DJ Sem.")).toBeVisible();

    await signIn(dj, "dj.sem@feestband.local");
    await dj.goto(`/nl/app/gigs/${first}`);
    await dj.getByRole("button", { name: "Optreden accepteren" }).click();
    await expect(dj.getByText("Optreden geaccepteerd.")).toBeVisible();
    await dj.getByRole("link", { name: "Apparatuur" }).click();
    await expect(dj.getByText("Je ziet de apparatuur voor dit optreden.", { exact: false })).toBeVisible();
    await expect(dj.getByText(XLR)).toBeVisible();
    await expect(dj.getByText("SECRET-SERIAL-1")).toHaveCount(0);

    await saveInventorySettings(owner, false, true);
    await dj.reload();
    await dj.getByRole("tab", { name: "Laden" }).click();
    await dj.getByRole("button", { name: "Alles", exact: true }).click();
    await expect(dj.getByText("4 van 4 geladen")).toBeVisible();

    // A DJ who isn't on the gig gets nothing.
    await dj.goto(`/nl/app/gigs/${second}/equipment`);
    await expect(dj.getByText(XLR)).toHaveCount(0);
  });

  await test.step("check-in: one cable damaged, the speaker missing", async () => {
    await owner.goto(`/nl/app/bookings/${first}/equipment`);
    await owner.getByRole("tab", { name: "Inchecken" }).click();
    const cables = owner.locator("li").filter({ hasText: XLR });
    await cables.getByRole("button", { name: "Beschadigd" }).click();
    await owner.getByRole("dialog").getByLabel("Aantal").fill("1");
    await owner.getByRole("dialog").getByRole("button", { name: "Schade vastleggen" }).click();
    await expect(owner.getByText("Schade vastgelegd.")).toBeVisible();
    await cables.getByRole("button", { name: "Alle 3 terug" }).click();
    await expect(cables.getByText("4 geladen · 3 terug · 1 beschadigd")).toBeVisible();

    await owner.getByRole("button", { name: "Inchecken afronden" }).click();
    await expect(owner.getByText("1 item ontbreekt", { exact: false }).first()).toBeVisible();
  });

  await test.step("missing stays unavailable; the owner confirms it lost, then it turns up", async () => {
    await owner.goto(`/nl/app/bookings/${second}/equipment`);
    await owner.getByRole("button", { name: "Opnieuw reserveren" }).click();
    await expect(owner.getByText(`Nog steeds niet beschikbaar: ${SPK}`, { exact: false })).toBeVisible();

    await owner.goto(`/nl/app/bookings/${first}/equipment`);
    await owner.getByRole("tab", { name: "Inchecken" }).click();
    await owner.locator("li").filter({ hasText: SPK }).getByRole("button", { name: "Verloren bevestigen" }).click();
    await owner.getByRole("dialog").getByLabel("Notitie").fill("Niet teruggevonden in de zaal");
    await owner.getByRole("dialog").getByRole("button", { name: "Verloren bevestigen" }).click();
    await expect(owner.getByText("Als verloren bevestigd.")).toBeVisible();

    await owner.goto(`/nl/app/inventory?q=${SPK}`);
    await owner.getByRole("link", { name: SPK }).click();
    await expect(owner.getByText("Verloren", { exact: true }).first()).toBeVisible();
    await owner.getByRole("button", { name: "Teruggevonden" }).click();
    await owner.getByRole("dialog").getByRole("button", { name: "Teruggevonden" }).click();
    await expect(owner.getByText("Weer op voorraad.")).toBeVisible();

    await owner.goto(`/nl/app/bookings/${second}/equipment`);
    await owner.getByRole("button", { name: "Opnieuw reserveren" }).click();
    await expect(owner.getByText("1 regel gereserveerd.")).toBeVisible();

    // The damaged cable is out of stock until repaired.
    await owner.goto(`/nl/app/inventory?q=${XLR}`);
    await expect(owner.getByText("10 (1 defect)")).toBeVisible();
  });

  await test.step("another agency sees shared equipment read-only, and loses it when sharing stops", async () => {
    await signIn(other, "eigenaar@rotterdamdj.local");
    await other.goto(`/nl/app/inventory/shared?q=${SPK}`);
    await expect(other.getByText(SPK)).toHaveCount(0);

    await saveInventorySettings(owner, true, true);
    await other.reload();
    await other.getByRole("link", { name: SPK }).click();
    await expect(other.getByText("Gedeeld door Feestband Utrecht")).toBeVisible();
    await expect(other.getByText("SECRET-SERIAL-1")).toHaveCount(0);
    await expect(other.getByRole("button", { name: /Bewerken|Afvoeren|Verwijderen/ })).toHaveCount(0);
    const detail = other.url();

    // Exports are the agency's own equipment only.
    const mine = await (await owner.request.get("/api/export/equipment")).text();
    expect(mine).toContain(SPK);
    expect(mine).toContain("SECRET-SERIAL-1");
    const theirs = await other.request.get("/api/export/equipment");
    expect(theirs.status()).toBe(200);
    expect(await theirs.text()).not.toContain(SPK);

    await saveInventorySettings(owner, false, false);
    await other.goto(detail);
    await expect(other.getByText("Gedeeld door Feestband Utrecht")).toHaveCount(0);
    await other.goto(`/nl/app/inventory/shared?q=${SPK}`);
    await expect(other.getByText(SPK)).toHaveCount(0);
  });

  await test.step("staff see the inventory but can't manage it or confirm losses", async () => {
    await signIn(staff, "planning@feestband.local");
    await staff.goto("/nl/app/inventory");
    await expect(staff.getByText(XLR)).toBeVisible();
    await expect(staff.getByRole("button", { name: "Apparatuur toevoegen" })).toHaveCount(0);
    await staff.goto("/nl/app/inventory/packages/new");
    await expect(staff.getByRole("button", { name: "Regel toevoegen" })).toHaveCount(0);
    // Gig equipment: staff can handle it, but the admin-only loss button isn't offered.
    await staff.goto(`/nl/app/bookings/${first}/equipment`);
    await staff.getByRole("tab", { name: "Inchecken" }).click();
    await expect(staff.getByText(XLR)).toBeVisible();
    await expect(staff.getByRole("button", { name: "Verloren bevestigen" })).toHaveCount(0);
  });
});
