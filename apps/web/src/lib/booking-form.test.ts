import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));

const { newBookingSchema } = await import("./booking-form");

const inAYear = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);

/**
 * The new-booking form only renders some fields: the partner's name for a
 * wedding, and the new-customer fields on that tab (the other tab isn't in the
 * page at all). A field that isn't sent must never fail the form.
 */
describe("new booking form", () => {
  it("accepts a corporate booking without a partner field", () => {
    const r = newBookingSchema.safeParse({ customerMode: "new", customerName: "Acme BV", customerEmail: "events@acme.test", eventType: "corporate", eventDate: inAYear });
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ partnerName: null, customerPhone: null, guestCount: null, budget: null, startTime: null });
  });

  it("accepts an existing customer without the new-customer fields", () => {
    const r = newBookingSchema.safeParse({ customerMode: "existing", customerId: "cust-1", eventType: "wedding", eventDate: inAYear });
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ customerId: "cust-1", customerName: null, customerEmail: null });
  });

  it("ignores what was typed on the tab that isn't chosen", () => {
    const existing = newBookingSchema.safeParse({ customerMode: "existing", customerId: "cust-1", customerEmail: "not an email", eventType: "birthday" });
    expect(existing.success && existing.data.customerEmail).toBe(null);
    const fresh = newBookingSchema.safeParse({ customerMode: "new", customerId: "cust-1", customerName: "Sanne", customerEmail: "sanne@test.local", eventType: "birthday" });
    expect(fresh.success && fresh.data.customerId).toBe(null);
  });

  it("keeps the partner's name for a wedding and drops it otherwise", () => {
    const wedding = newBookingSchema.safeParse({ customerMode: "existing", customerId: "c", eventType: "wedding", partnerName: " Tom " });
    expect(wedding.success && wedding.data.partnerName).toBe("Tom");
    const party = newBookingSchema.safeParse({ customerMode: "existing", customerId: "c", eventType: "party", partnerName: "Tom" });
    expect(party.success && party.data.partnerName).toBe(null);
  });

  it("still checks the fields that are shown", () => {
    const r = newBookingSchema.safeParse({ customerMode: "new", customerName: "X", customerEmail: "nope", eventType: "party", eventDate: "2000-01-01" });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.path[0]).sort()).toEqual(["customerEmail", "eventDate"]);
  });
});
