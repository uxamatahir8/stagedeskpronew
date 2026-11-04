import { expect, type APIRequestContext, test } from "@playwright/test";
import { closeBrowserContexts, DEMO_PASSWORD, signIn } from "./helpers";

const MAILPIT = "http://localhost:8025/api/v1";
const run = Date.now().toString(36);

async function fromMail(request: APIRequestContext, to: string, pattern: RegExp) {
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

/** An independent artist starts on their own: sign-up, onboarding, profile, availability and a listing. Test domain only. */
test("an independent artist signs up, sets up their business and offers a gig", async ({ browser, request }) => {
  test.setTimeout(240_000);
  const page = await (await browser.newContext()).newPage();
  const email = `solo.${run}@test.local`;
  const stage = `E2E Solo ${run}`;

  await test.step("signs up and confirms their address", async () => {
    await page.goto(`/nl/sign-up?next=${encodeURIComponent("/onboarding?start=artist")}`);
    await page.locator("#signup-name").fill(`Solo ${run}`);
    await page.locator("#signup-email").fill(email);
    await page.locator("#signup-password").fill(DEMO_PASSWORD);
    await page.locator("#signup-confirm").fill(DEMO_PASSWORD);
    await page.locator('form button[type="submit"]').click();
    const link = await fromMail(request, email, /(https?:\/\/\S*verify-email\S+)/);
    await page.goto(link);
  });

  await test.step("makes their artist account", async () => {
    await page.goto("/nl/onboarding?start=artist");
    if (!(await page.locator("#solo-name").isVisible({ timeout: 10_000 }).catch(() => false))) {
      await signIn(page, email).catch(() => undefined);
      await page.goto("/nl/onboarding?start=artist");
    }
    await page.locator("#solo-name").fill(stage);
    await page.locator("#solo-city").fill("Utrecht");
    await page.locator("#solo-genres").fill("House, Disco");
    await page.getByRole("button", { name: "Mijn artiestenaccount maken" }).click();
    await expect(page).toHaveURL(/\/app/, { timeout: 60_000 });
  });

  await test.step("the menu is their own business's, without another agency's team pages", async () => {
    await page.goto("/nl/app");
    const gate = page.getByLabel(/Ik ga akkoord/);
    const shell = page.locator('[data-slot="sidebar"]').first();
    await expect(gate.or(shell)).toBeVisible({ timeout: 30_000 });
    if (await gate.isVisible()) {
      await gate.check();
      await page.getByRole("button", { name: "Doorgaan" }).click();
      await expect(shell).toBeVisible({ timeout: 60_000 });
    }
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
