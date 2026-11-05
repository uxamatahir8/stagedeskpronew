import { expect, test } from "@playwright/test";
import { closeBrowserContexts, enterAppAsNewAccount, signUpSoloArtist } from "./helpers";

const run = Date.now().toString(36);

/** An independent artist starts on their own: sign-up, onboarding, profile, availability and a listing. Test domain only. */
test("an independent artist signs up, sets up their business and offers a gig", async ({ browser, request }) => {
  test.setTimeout(240_000);
  const page = await (await browser.newContext()).newPage();
  const email = `solo.${run}@test.local`;
  const stage = `E2E Solo ${run}`;

  await test.step("signs up, confirms their address and makes their artist account", async () => {
    await signUpSoloArtist(page, request, { name: `Solo ${run}`, email, stage });
  });

  await test.step("the menu is their own business's, without another agency's team pages", async () => {
    await enterAppAsNewAccount(page);
    const shell = page.locator('[data-slot="sidebar"]').first();
    await expect(shell.getByRole("link", { name: "Boekingen" })).toBeVisible();
    await expect(shell.getByRole("link", { name: "Team" })).toHaveCount(0);
  });

  await test.step("marks a date unavailable, and it stays marked", async () => {
    await page.goto("/nl/app/availability");
    const free = page.locator('button[aria-pressed="false"]:not([disabled])').first();
    await expect(free).toBeVisible({ timeout: 30_000 });
    const label = await free.getAttribute("aria-label");
    const date = label!.slice(0, 10);
    // The button changes at once; the save is what has to finish before reloading.
    const saved = page.waitForResponse((r) => r.request().method() === "POST" && Boolean(r.request().headers()["next-action"]));
    await free.click();
    await expect(page.locator(`button[aria-label^="${date}"]`)).toHaveAttribute("aria-pressed", "true");
    expect((await saved).ok()).toBe(true);
    await page.reload();
    await expect(page.locator(`button[aria-label^="${date}"]`)).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
  });

  await test.step("adds a gig they offer, and it's listed", async () => {
    await page.goto("/nl/app/listings");
    await page.getByRole("button", { name: "Optreden aanbieden" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#ls-title").fill(`Bruiloft-DJ ${run}`);
    await dialog.locator("#ls-price").fill("650");
    await dialog.locator("#ls-hours").fill("4");
    await dialog.getByRole("button", { name: "Optreden opslaan" }).click();
    await expect(page.getByText("Optreden opgeslagen.")).toBeVisible();
    await expect(page.getByText(`Bruiloft-DJ ${run}`).first()).toBeVisible();
  });

  await closeBrowserContexts(browser);
});
