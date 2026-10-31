import { type APIRequestContext, expect, type Page, type Request, test } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * Direct server-action requests can't do more than the UI offers. Each action
 * is captured from the owner's own browser, then replayed with someone
 * else's session (staff without the permission, another agency's owner, a DJ
 * who isn't on the gig); the owner's view must not change.
 */

const run = Date.now().toString(36).toUpperCase();
const SPK = `E2E-SEC-${run}`;
const days = 50 + (Math.floor(Date.now() / 60_000) % 250);
const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date(Date.now() + days * 86_400_000));

/** Runs `action` in the page and returns the server-action request it made. */
async function capture(page: Page, action: () => Promise<unknown>): Promise<Request> {
  const request = page.waitForRequest((r) => r.method() === "POST" && Boolean(r.headers()["next-action"]));
  await action();
  return request;
}

/** Sends the same server action with another session, optionally with changed arguments. */
async function replay(as: APIRequestContext, request: Request, change: (body: string) => string = (b) => b) {
  const headers = request.headers();
  return as.post(request.url(), {
    headers: { "next-action": headers["next-action"]!, "content-type": headers["content-type"] ?? "text/plain;charset=UTF-8", accept: "text/x-component" },
    data: change(request.postData() ?? ""),
    failOnStatusCode: false,
  });
}

test("server actions refuse direct requests from people without the right access", async ({ browser }) => {
  test.setTimeout(300_000);
  const owner = await (await browser.newContext()).newPage();
  const staff = await (await browser.newContext()).newPage();
  const other = await (await browser.newContext()).newPage();
  const dj = await (await browser.newContext()).newPage();
  owner.on("dialog", (d) => d.accept());

  await signIn(owner, "eigenaar@feestband.local");
  await signIn(staff, "planning@feestband.local");
  await signIn(other, "eigenaar@rotterdamdj.local");
  await signIn(dj, "dj.sem@feestband.local");

  let createItem: Request;
  await test.step("staff can't create equipment by replaying the owner's request", async () => {
    await owner.goto("/nl/app/inventory");
    await owner.getByRole("button", { name: "Apparatuur toevoegen" }).click();
    const dialog = owner.getByRole("dialog");
    await dialog.getByLabel("Nummer", { exact: true }).fill(SPK);
    await dialog.getByLabel("Naam", { exact: true }).fill("Beveiligingstest");
    createItem = await capture(owner, () => dialog.getByRole("button", { name: "Opslaan" }).click());
    await expect(owner).toHaveURL(/\/app\/inventory\/[\w-]+$/);

    await replay(staff.request, createItem, (b) => b.replace(SPK, `${SPK}-STAFF`));
    await owner.goto(`/nl/app/inventory?q=${SPK}-STAFF`);
    await expect(owner.getByText(`${SPK}-STAFF`)).toHaveCount(0);
    // Control: the same replay with the owner's own session works, so the refusal above is the permission check.
    await replay(owner.request, createItem, (b) => b.replace(SPK, `${SPK}-OWNER`));
    await owner.goto(`/nl/app/inventory?q=${SPK}-OWNER`);
    await expect(owner.getByRole("link", { name: `${SPK}-OWNER`, exact: true })).toBeVisible();
  });
  const itemUrl = await (async () => {
    await owner.goto(`/nl/app/inventory?q=${SPK}`);
    await owner.getByRole("link", { name: SPK, exact: true }).click();
    // The item page, not the list: the write-off replay below targets this item's id.
    await owner.waitForURL(/\/app\/inventory\/[0-9a-f-]{36}$/);
    return owner.url();
  })();

  let code = "";
  await test.step("a booked gig with the item on its packing list", async () => {
    await owner.goto("/nl/app/bookings/new");
    await owner.getByRole("tab", { name: "Nieuwe klant" }).click();
    await owner.getByLabel("Je naam").fill(`E2E Sec ${run}`);
    await owner.getByLabel("E-mailadres").fill(`sec.${run.toLowerCase()}@test.local`);
    await owner.getByLabel("Datum").fill(date);
    await owner.getByLabel("Naam locatie").fill("Tivoli");
    await owner.getByLabel("Plaats").fill("Utrecht");
    await owner.getByRole("button", { name: "Boeking aanmaken" }).click();
    await expect(owner).toHaveURL(/\/app\/bookings\/[A-Z2-9]{8}$/);
    // Equipment is reserved per day: the booking must have its date.
    await expect(owner.getByText("Nog geen datum")).toHaveCount(0);
    await expect(owner.getByText(/\d{4}/).first()).toBeVisible();
    code = owner.url().split("/").pop()!;
    await owner.getByRole("button", { name: "Offerte maken" }).click();
    await owner.getByRole("button", { name: "Toevoegen uit diensten" }).click();
    await owner.getByRole("menuitem", { name: /DJ, per uur/ }).click();
    await owner.getByRole("button", { name: "Offerte versturen" }).click();
    await expect(owner.getByText("Offerte versie 1 verstuurd.")).toBeVisible();
    await owner.getByRole("button", { name: "Namens klant accepteren" }).click();
    await owner.getByRole("dialog").getByRole("button", { name: "Offerte accepteren" }).click();
    await expect(owner.getByText("Geboekt", { exact: true }).first()).toBeVisible();
  });

  let add: Request;
  await test.step("another agency can't add to, or read, this agency's packing list", async () => {
    await owner.goto(`/nl/app/bookings/${code}/equipment`);
    await owner.getByRole("combobox", { name: "Kies apparatuur…" }).click();
    await owner.getByRole("option", { name: new RegExp(`^${SPK} ·`) }).click();
    add = await capture(owner, () => owner.getByRole("button", { name: "Toevoegen", exact: true }).click());
    await expect(owner.getByText("1 item toegevoegd.")).toBeVisible();

    // Remove it again as the owner, then replay the add as another agency.
    await owner.getByRole("button", { name: "Verwijderen" }).click();
    await expect(owner.getByText("Verwijderd.")).toBeVisible();
    await replay(other.request, add);
    await owner.reload();
    await expect(owner.getByText("Nog niets op de paklijst.")).toBeVisible();

    await other.goto(`/nl/app/bookings/${code}/equipment`);
    await expect(other.getByText(SPK)).toHaveCount(0);
  });

  await test.step("neither another agency nor a DJ who isn't on the gig can load", async () => {
    await replay(owner.request, add);
    await owner.reload();
    await owner.getByRole("tab", { name: "Laden" }).click();
    const load = await capture(owner, () => owner.getByRole("button", { name: "Geladen" }).click());
    await expect(owner.getByText("1 van 1 geladen")).toBeVisible();
    await owner.getByRole("button", { name: "Ongedaan" }).click();
    await expect(owner.getByText("0 van 1 geladen")).toBeVisible();

    await replay(other.request, load);
    await replay(dj.request, load);
    await owner.reload();
    await owner.getByRole("tab", { name: "Laden" }).click();
    await expect(owner.getByText("0 van 1 geladen")).toBeVisible();
    await dj.goto(`/nl/app/gigs/${code}/equipment`);
    await expect(dj.getByText(SPK)).toHaveCount(0);
  });

  await test.step("staff can't write equipment off as lost by replaying the owner's request", async () => {
    // A second item the owner writes off, to capture the request.
    await owner.goto("/nl/app/inventory");
    await owner.getByRole("button", { name: "Apparatuur toevoegen" }).click();
    await owner.getByRole("dialog").getByLabel("Nummer", { exact: true }).fill(`${SPK}-B`);
    await owner.getByRole("dialog").getByLabel("Naam", { exact: true }).fill("Tweede");
    await owner.getByRole("dialog").getByRole("button", { name: "Opslaan" }).click();
    await expect(owner).toHaveURL(/\/app\/inventory\/[\w-]+$/);
    const secondId = owner.url().split("/").pop()!;
    await owner.getByRole("button", { name: "Afschrijven als verloren" }).click();
    await owner.getByRole("dialog").getByLabel("Notitie").fill("test");
    const lost = await capture(owner, () => owner.getByRole("dialog").getByRole("button", { name: "Afschrijven als verloren" }).click());
    await expect(owner.getByText("Afgeschreven als verloren.")).toBeVisible();

    const firstId = itemUrl.split("/").pop()!;
    await replay(staff.request, lost, (b) => b.replace(secondId, firstId));
    // Lost equipment, filtered by status: the owner's write-off is there, the staff replay changed nothing.
    await owner.goto(`/nl/app/inventory?q=${SPK}&status=lost`);
    await expect(owner.getByRole("link", { name: `${SPK}-B`, exact: true })).toBeVisible();
    await expect(owner.getByRole("link", { name: SPK, exact: true })).toHaveCount(0);
    await owner.goto(itemUrl);
    await expect(owner.getByRole("button", { name: "Afschrijven als verloren" })).toBeVisible();
    // Control: the owner's own replay against this item does write it off.
    await replay(owner.request, lost, (b) => b.replace(secondId, firstId));
    await owner.goto(`/nl/app/inventory?q=${SPK}&status=lost`);
    await expect(owner.getByRole("link", { name: SPK, exact: true })).toBeVisible();
  });
});
