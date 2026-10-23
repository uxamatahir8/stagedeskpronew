import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * Agency websites: an owner edits and publishes their site, a visitor sees
 * it on the agency's free address, and a Business agency connects its own
 * domain (a .localhost name, which development accepts without DNS).
 */
test("an agency builds and publishes its website, also on its own domain", async ({ browser }) => {
  const run = Date.now().toString(36);
  const owner = await (await browser.newContext()).newPage();
  const visitor = await (await browser.newContext()).newPage();
  const admin = await (await browser.newContext()).newPage();
  const rotterdam = await (await browser.newContext()).newPage();
  const title = `Feest zonder zorgen ${run}`;

  await test.step("the owner edits the hero, adds a packages section and publishes", async () => {
    await signIn(owner, "eigenaar@feestband.local");
    await owner.goto("/app/website");
    const preview = owner.getByTestId("site-preview");
    await preview.locator("[data-section=hero] h1").click();
    await owner.getByLabel("Titel", { exact: true }).fill(title);
    await owner.getByRole("button", { name: "Onderdeel toevoegen" }).click();
    await owner.getByRole("menuitem", { name: "Pakketten & prijzen" }).click();
    await expect(preview.getByRole("heading", { name: "Pakketten en prijzen" }).last()).toBeVisible();
    await expect(preview.getByText("DJ, per uur").first()).toBeVisible();
    await expect(owner.getByText("Alles opgeslagen")).toBeVisible({ timeout: 15_000 });
    await owner.getByRole("button", { name: "Publiceren" }).click();
    await expect(owner.getByText("Je site is gepubliceerd.")).toBeVisible();
  });

  await test.step("a visitor sees it on the free address, with live packages and the booking form", async () => {
    await visitor.goto("http://feestband-utrecht.localhost:3000/");
    await expect(visitor.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(visitor.getByText("DJ, per uur").first()).toBeVisible();
    await expect(visitor.getByRole("button", { name: "Aanvraag versturen" })).toBeVisible();
    await expect(visitor).toHaveTitle(/Feestband Utrecht/);
    // Through the browser: Chrome resolves *.localhost itself, Node's DNS does not.
    await visitor.goto("http://feestband-utrecht.localhost:3000/sitemap.xml");
    expect(await visitor.content()).toContain("http://feestband-utrecht.localhost:3000/");
  });

  await test.step("own domains are a Business feature", async () => {
    await owner.goto("/app/website/domain");
    await expect(owner.getByText("Een eigen domein hoort bij het Business-abonnement", { exact: false })).toBeVisible();
  });

  await test.step("on Business, Rotterdam connects its own domain and its site shows there", async () => {
    await signIn(admin, "admin@stagedesk.local");
    await admin.goto("/app/agencies?q=Rotterdam");
    await admin.getByRole("link", { name: "Rotterdam DJ Collectief" }).click();
    await admin.getByRole("combobox", { name: "Abonnement toekennen" }).click();
    await admin.getByRole("option", { name: "Business" }).click();
    await admin.getByRole("button", { name: "Toekennen" }).click();
    await expect(admin.getByText("Abonnement toegekend.")).toBeVisible();

    const domain = `www.rotterdam-${run}.localhost`;
    await signIn(rotterdam, "eigenaar@rotterdamdj.local");
    await rotterdam.goto("/app/website");
    // An earlier run may already have published it; publish only when there's something new.
    const publish = rotterdam.getByRole("button", { name: /^(Publiceren|Gepubliceerd)$/ });
    await expect(publish).toBeVisible();
    if (await publish.isEnabled()) {
      await publish.click();
      await expect(rotterdam.getByText("Je site is gepubliceerd.")).toBeVisible();
    }
    await rotterdam.goto("/app/website/domain");
    await rotterdam.getByLabel("Domein", { exact: true }).fill(domain);
    await rotterdam.getByRole("button", { name: "Domein toevoegen" }).click();
    await expect(rotterdam.getByText("Domein toegevoegd.", { exact: false })).toBeVisible();
    await rotterdam.getByRole("button", { name: "Controleren" }).click();
    await expect(rotterdam.getByText("Domein gekoppeld.")).toBeVisible();

    await visitor.goto(`http://${domain}:3000/`);
    await expect(visitor.getByText("Rotterdam DJ Collectief").first()).toBeVisible();

    await rotterdam.getByRole("button", { name: "Verwijderen" }).click();
    await expect(rotterdam.getByText("Domein verwijderd.")).toBeVisible();
  });
});
