import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * The platform admin writes a blog post in a new category, features it, and
 * readers find it as the lead story, on the category page and in English;
 * then both are removed again.
 */
test("blog posts and categories from the admin panel", async ({ browser }) => {
  test.setTimeout(180_000);
  const run = Date.now().toString(36);
  const admin = await (await browser.newContext()).newPage();
  const reader = await (await browser.newContext()).newPage();
  await signIn(admin, "admin@stagedesk.local");

  await test.step("the admin adds a category", async () => {
    await admin.goto("/nl/app/content");
    await admin.getByRole("button", { name: "Categorie toevoegen" }).click();
    await admin.getByLabel("Naam (Nederlands)").fill(`Testrubriek ${run}`);
    await admin.getByLabel("Naam (Engels)").fill(`Test section ${run}`);
    await admin.getByRole("button", { name: "Opslaan" }).click();
    await expect(admin.getByText("Categorie opgeslagen.")).toBeVisible();
  });

  await test.step("and publishes a featured post in it, in both languages", async () => {
    await admin.goto("/nl/app/content/new?kind=blog");
    await admin.locator("#title:visible").fill(`Uitgelicht ${run}`);
    await admin.locator("#excerpt:visible").fill("Korte omschrijving.");
    await admin.locator("#body:visible").fill("Intro.\n\n## Eerste kop\n\nTekst.\n\n## Tweede kop\n\nMeer tekst.");
    await admin.getByRole("tab", { name: /Engels/ }).click();
    await admin.locator("#title:visible").fill(`Featured ${run}`);
    await admin.locator("#body:visible").fill("Intro in English.");
    await admin.locator("#category:visible").selectOption({ label: `Testrubriek ${run}` });
    await admin.getByLabel("Uitgelicht").click();
    await admin.getByRole("button", { name: "Publiceren", exact: true }).click();
    await expect(admin.getByText("Opgeslagen en gepubliceerd.")).toBeVisible();
    await expect(admin).toHaveURL(/\/app\/content\/[0-9a-f-]{36}$/);
  });

  await test.step("readers see it first, with its category and table of contents", async () => {
    await reader.goto("/nl/blog");
    await expect(reader.getByRole("heading", { level: 2 }).first()).toHaveText(`Uitgelicht ${run}`);
    await reader.getByRole("link", { name: new RegExp(`Testrubriek ${run}`) }).first().click();
    await expect(reader).toHaveURL(/\/blog\/category\/testrubriek-/);
    await reader.getByRole("link", { name: `Uitgelicht ${run}` }).first().click();
    await expect(reader.getByRole("heading", { level: 1 })).toHaveText(`Uitgelicht ${run}`);
    await expect(reader.getByRole("navigation", { name: "In dit artikel" }).getByRole("link", { name: "Tweede kop" })).toBeVisible();
    await reader.goto(reader.url().replace("/blog/", "/en/blog/"));
    await expect(reader.getByRole("heading", { level: 1 })).toHaveText(`Featured ${run}`);
  });

  await test.step("the admin deletes the post and then the category", async () => {
    admin.once("dialog", (d) => void d.accept());
    await admin.getByRole("button", { name: "Verwijderen" }).filter({ visible: true }).click();
    await expect(admin).toHaveURL(/\/app\/content$/);
    admin.once("dialog", (d) => void d.accept());
    await admin.getByRole("listitem").filter({ hasText: `Testrubriek ${run}` }).getByRole("button", { name: "Categorie verwijderen" }).click();
    await expect(admin.getByText("Categorie verwijderd.")).toBeVisible();
  });
});
