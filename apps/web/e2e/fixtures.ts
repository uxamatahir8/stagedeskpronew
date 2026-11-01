import { test as base } from "@playwright/test";

/**
 * `test` for every spec. Specs open extra users with browser.newContext(),
 * which Playwright doesn't close at the end of a test: they stayed open until
 * the whole run ended, each page keeping its notification stream and polling
 * the server, so late specs ran against a server busy with dozens of
 * leftover pages (stalled page loads, 100 s requests). This closes every
 * context a test created when it ends.
 */
export const test = base.extend<{ closeOwnContexts: void }>({
  closeOwnContexts: [
    async ({ browser }, use) => {
      const before = new Set(browser.contexts());
      await use();
      for (const context of browser.contexts()) {
        if (!before.has(context)) await context.close().catch(() => undefined);
      }
    },
    { auto: true },
  ],
});
