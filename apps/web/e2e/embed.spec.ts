import { expect, test } from "@playwright/test";

// Chrome asks permission before a website may reach a local address. A real agency
// site and StageDesk are both public, so that prompt never applies; turn it off here.
test.use({
  launchOptions: { args: ["--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests"] },
});

test("the embed script puts the form on another website and sizes it", async ({ page, baseURL }) => {
  // A stand-in for the agency's own website, on a different origin (127.0.0.1 vs localhost).
  const site = "http://127.0.0.1:3000/agency-website";
  await page.route(site, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<html><body><h1>Welkom bij Feestband</h1><script src="${baseURL}/embed.js" data-agency="feestband-utrecht" data-lang="nl"></script></body></html>`,
    }),
  );
  await page.goto(site);
  const frame = page.frameLocator("iframe");
  await expect(frame.getByRole("button", { name: "Aanvraag versturen" })).toBeVisible({ timeout: 30_000 });
  // The frame reports its height, so the parent page grows it beyond the 640px starting size.
  await expect.poll(async () => (await page.locator("iframe").boundingBox())?.height ?? 0, { timeout: 15_000 }).toBeGreaterThan(700);
});
