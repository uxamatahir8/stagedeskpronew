import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { ADMIN_EMAIL, closeBrowserContexts, signIn, signUpSoloArtist } from "./helpers";

/**
 * Walks every role through every page its sidebar and account menu offer, on a
 * desktop and a phone screen, and fails on what a person would hit: a server
 * error, an error page, a console error, a failed request, or a page wider
 * than a phone. Writes what it visited to QA_CRAWL_OUT (a JSON file), with a
 * screenshot of each page next to it, as evidence for the QA report.
 */

const run = Date.now().toString(36);
// The seed has no independent artist, so that account is made by the test. On a test domain.
const SOLO = `solo.crawl.${run}@test.local`;

const accounts = [
  { role: "platform_admin", email: ADMIN_EMAIL },
  { role: "agency_owner", email: "eigenaar@feestband.local" },
  { role: "agency_admin", email: "beheer@feestband.local" },
  { role: "agency_staff", email: "planning@feestband.local" },
  { role: "artist", email: "dj.sem@feestband.local" },
  { role: "solo_artist", email: SOLO },
  { role: "customer", email: "sanne@klant.local" },
  { role: "affiliate", email: "partner@stagedesk.local" },
] as const;

const publicPages = ["/nl", "/", "/nl/sign-in", "/nl/sign-up", "/nl/forgot-password", "/nl/request", "/nl/partners", "/nl/blog", "/nl/changelog", "/nl/b/feestband-utrecht", "/b/feestband-utrecht", "/embed/feestband-utrecht"];

const out = process.env["QA_CRAWL_OUT"];
type Visit = { role: string; viewport: string; path: string; status: number | null; problems: string[]; screenshot: string | null };
// Each failed test restarts the worker and this module: carry on from what's on disk.
const results: Visit[] = out && existsSync(out) ? (JSON.parse(readFileSync(out, "utf8")) as Visit[]) : [];
const save = () => {
  if (!out) return;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(results, null, 2));
};

// Noise that isn't a defect of the page: dev-server tooling, aborted prefetches when navigating on, and the
// email preview's sandbox doing its job (the browser tooling's own script is refused in the empty-sandbox frame).
const ignorable = (text: string) => /Download the React DevTools|\[HMR\]|\[Fast Refresh\]|favicon|net::ERR_ABORTED|turnstile|challenges\.cloudflare|Blocked script execution in 'about:srcdoc'/i.test(text);

function watch(page: Page) {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !ignorable(message.text())) problems.push(`console: ${message.text().slice(0, 4000)}`);
  });
  page.on("pageerror", (error) => problems.push(`exception: ${error.message.slice(0, 300)}`));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (response.status() >= 500 && url.hostname === "localhost") problems.push(`HTTP ${response.status()}: ${url.pathname}`);
  });
  return problems;
}

async function visit(page: Page, problems: string[], role: string, viewport: string, path: string) {
  problems.length = 0;
  const response = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  const local = [...problems];
  const status = response?.status() ?? null;
  if (status && status >= 500) local.push(`status ${status}`);
  const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 4000);
  if (/Application error|Internal Server Error|Something went wrong|Er ging iets mis/i.test(body)) local.push("error text on the page");
  if (/\b(MISSING_MESSAGE|customerEvent\.|booking\.[a-z]+[A-Z]|artistAccount\.)/.test(body)) local.push("untranslated message key on the page");
  if (viewport === "phone") {
    const wider = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      // The element reaching furthest, to say what's in the way.
      const far = [...document.querySelectorAll("main *")].sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0];
      return { by: document.documentElement.scrollWidth - width, far: far ? `${far.tagName} ${String(far.className).slice(0, 80)}` : "" };
    });
    if (wider.by > 4) local.push(`page is ${wider.by}px wider than the phone screen (${wider.far})`);
  }
  let screenshot: string | null = null;
  if (out) {
    const file = `${role}-${viewport}-${path.replace(/[^\w]+/g, "_") || "home"}.png`;
    screenshot = join(dirname(out), "screens", file);
    mkdirSync(dirname(screenshot), { recursive: true });
    // caret "initial": by default Playwright styles inputs for the shot, which React reports as a hydration mismatch.
    await page.screenshot({ path: screenshot, fullPage: false, caret: "initial" }).catch(() => (screenshot = null));
  }
  results.push({ role, viewport, path, status, problems: local, screenshot });
  save();
  return local;
}

/** Every page this person's menus offer, from the page itself: no list here to fall out of date. */
async function menuLinks(page: Page) {
  await page.goto("/nl/app", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-slot="sidebar"]').first()).toBeVisible({ timeout: 60_000 });
  const hrefs = await page.locator('[data-slot="sidebar"] a[href*="/app"]').evaluateAll((links) => links.map((l) => (l as HTMLAnchorElement).getAttribute("href")!));
  return [...new Set(["/nl/app/profile", "/nl/app/notifications", ...hrefs.map((h) => h.split("?")[0]!)])];
}

/** One example of each kind of detail page the current page links to: /app/bookings/K7Q2M9XA, /app/agencies/<id>… */
async function detailLinks(page: Page, seen: Set<string>) {
  const hrefs = await page.locator('main a[href*="/app/"]').evaluateAll((links) => links.map((l) => (l as HTMLAnchorElement).getAttribute("href")!));
  const found: string[] = [];
  for (const href of hrefs) {
    const path = href.split(/[?#]/)[0]!;
    const shape = path.split("/").map((part) => (/^[A-Z2-9]{8}$|\d|^[0-9a-f-]{16,}$/.test(part) ? ":id" : part)).join("/");
    if (seen.has(shape)) continue;
    seen.add(shape);
    found.push(path);
  }
  return found;
}

test.describe("every role opens every page", () => {
  test.afterEach(async ({ browser }) => {
    await closeBrowserContexts(browser);
  });

  for (const account of accounts) {
    test(`${account.role} on desktop and phone`, async ({ browser, request }) => {
      test.setTimeout(1_800_000);
      if (account.email === SOLO) {
        const setup = await (await browser.newContext()).newPage();
        await signUpSoloArtist(setup, request, { name: `Solo Crawl ${run}`, email: SOLO, stage: `E2E Crawl ${run}` });
        await setup.context().close();
      }
      const desktop = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
      await signIn(desktop, account.email);
      const paths = await menuLinks(desktop);
      expect(paths.length).toBeGreaterThan(2);
      const storage = await desktop.context().storageState();
      const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: storage })).newPage();

      const failures: string[] = [];
      const seen = new Set(paths);
      const details: string[] = [];
      for (const [page, viewport] of [[desktop, "desktop"], [phone, "phone"]] as const) {
        const problems = watch(page);
        for (const path of paths) {
          for (const problem of await visit(page, problems, account.role, viewport, path)) failures.push(`${viewport} ${path}: ${problem}`);
          if (viewport === "desktop") details.push(...(await detailLinks(page, seen)));
        }
        // Detail pages, one of each kind, on the same screen.
        for (const path of details.slice(0, 30)) {
          for (const problem of await visit(page, problems, account.role, viewport, path)) failures.push(`${viewport} ${path}: ${problem}`);
        }
      }
      expect(failures, failures.join("\n")).toEqual([]);
    });
  }

  test("public pages on desktop and phone", async ({ browser }) => {
    test.setTimeout(600_000);
    const failures: string[] = [];
    for (const [viewport, size] of [["desktop", { width: 1280, height: 800 }], ["phone", { width: 390, height: 844 }]] as const) {
      const page = await (await browser.newContext({ viewport: size })).newPage();
      const problems = watch(page);
      for (const path of publicPages) for (const problem of await visit(page, problems, "public", viewport, path)) failures.push(`${viewport} ${path}: ${problem}`);
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
});
