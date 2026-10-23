import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

/** The platform admin manages agencies, partners and accounts by hand. */
test("platform admin creates, finds, suspends and deletes an agency; adds and removes a partner and an admin", async ({ page }) => {
  const run = Date.now().toString(36);
  const agency = `E2E Beheer ${run}`;
  const partner = `Piet Partner ${run}`;
  await signIn(page, "admin@stagedesk.local");

  await test.step("a new agency is created for an owner and opens on its own page", async () => {
    await page.goto("/app/agencies");
    await page.getByRole("button", { name: "Nieuw bureau" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Naam van het bureau").fill(agency);
    await dialog.getByLabel("Naam eigenaar").fill("Olga Eigenaar");
    await dialog.getByLabel("E-mailadres eigenaar").fill(`eigenaar.${run}@e2e-beheer.nl`);
    await dialog.getByRole("switch").click();
    await dialog.getByRole("button", { name: "Bureau aanmaken" }).click();
    await expect(page.getByText(`${agency} aangemaakt.`)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: agency })).toBeVisible();
  });

  await test.step("search finds it by owner email", async () => {
    await page.goto("/app/agencies");
    await page.getByPlaceholder("Naam, plaats, KvK of e-mail eigenaar").fill(`eigenaar.${run}`);
    await page.getByRole("button", { name: "Zoeken", exact: true }).click();
    await expect(page.getByRole("row").filter({ hasText: agency })).toHaveCount(1);
    await page.getByRole("link", { name: agency }).click();
    await expect(page.getByRole("heading", { level: 1, name: agency })).toBeVisible();
  });

  await test.step("it is suspended, reactivated and deleted", async () => {
    await page.getByRole("button", { name: "Opschorten" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Opschorten" }).click();
    await expect(page.getByText("Bureau opgeschort.")).toBeVisible();
    await page.getByRole("button", { name: "Heractiveren" }).click();
    await expect(page.getByRole("button", { name: "Opschorten" })).toBeVisible();

    await page.getByRole("button", { name: "Verwijderen" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(`Typ ${agency} om te bevestigen`).fill(agency);
    await dialog.getByRole("button", { name: "Definitief verwijderen" }).click();
    await expect(page.getByText(`${agency} verwijderd.`)).toBeVisible();
    await expect(page).toHaveURL(/\/app\/agencies$/);
  });

  await test.step("a partner is added, edited and deleted", async () => {
    await page.goto("/app/affiliates");
    await page.getByRole("button", { name: "Partner toevoegen" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Naam", { exact: true }).fill(partner);
    await dialog.getByLabel("E-mailadres").fill(`piet.${run}@e2e-beheer.nl`);
    await dialog.getByRole("switch").click();
    await dialog.getByRole("button", { name: "Partner toevoegen" }).click();
    await expect(page.getByText("Partner toegevoegd.")).toBeVisible();

    const row = page.getByRole("row").filter({ hasText: partner });
    await row.getByRole("button", { name: `Acties voor ${partner}` }).click();
    await page.getByRole("menuitem", { name: "Bewerken" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Website").fill("https://piet.example");
    await dialog.getByRole("button", { name: "Opslaan" }).click();
    await expect(page.getByText("Partner opgeslagen.")).toBeVisible();

    await row.getByRole("button", { name: `Acties voor ${partner}` }).click();
    await page.getByRole("menuitem", { name: "Partner verwijderen" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Partner verwijderen" }).click();
    await expect(page.getByText("Partner verwijderd.")).toBeVisible();
    await expect(row).toHaveCount(0);
  });

  await test.step("a platform admin is added, found with the filter and deleted again", async () => {
    await page.goto("/app/users");
    await page.getByRole("button", { name: "Beheerder toevoegen" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Naam").fill(`Bea Beheer ${run}`);
    await dialog.getByLabel("E-mailadres").fill(`bea.${run}@e2e-beheer.nl`);
    await dialog.getByRole("button", { name: "Beheerder toevoegen" }).click();
    await expect(page.getByText(`Bea Beheer ${run} is nu platformbeheerder.`)).toBeVisible();

    await page.getByRole("link", { name: "Platformbeheerders" }).click();
    const row = page.getByRole("row").filter({ hasText: `bea.${run}@e2e-beheer.nl` });
    await expect(row).toHaveCount(1);
    await row.getByRole("button", { name: `Acties voor Bea Beheer ${run}` }).click();
    await page.getByRole("menuitem", { name: "Account verwijderen" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Definitief verwijderen" }).click();
    await expect(page.getByText("Account verwijderd.")).toBeVisible();
    await expect(row).toHaveCount(0);
  });

  await test.step("email previews show each email in both languages and send a test", async () => {
    await page.goto("/app/emails");
    await page.getByRole("link", { name: /Offerte verstuurd/ }).click();
    await expect(page.getByText("Je offerte van Feestband Utrecht")).toBeVisible();
    await page.getByRole("link", { name: "English" }).click();
    await expect(page.getByText("Your quote from Feestband Utrecht")).toBeVisible();
    await expect(page.frameLocator("iframe").getByText("Feestband Utrecht").first()).toBeVisible();
    await page.getByRole("button", { name: "Test naar mij sturen" }).click();
    await expect(page.getByText("Testmail verstuurd naar admin@stagedesk.local.")).toBeVisible();
  });
});
