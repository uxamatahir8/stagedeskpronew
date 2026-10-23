import { describe, expect, it } from "vitest";
import { normalizeHostname, sectionSchema, siteHost, sitePageContentSchema, starterHome } from "./sites";

describe("site hosts", () => {
  const platform = ["stagedesk.nl", "app.stagedesk.nl"];

  it("recognises free subdomains, custom domains and the platform's own hosts", () => {
    expect(siteHost("feestband.stagedesk.site", "stagedesk.site", platform)).toEqual({ kind: "subdomain", slug: "feestband" });
    expect(siteHost("feestband-utrecht.localhost:3000", "localhost", platform)).toEqual({ kind: "subdomain", slug: "feestband-utrecht" });
    expect(siteHost("www.feestband.nl", "stagedesk.site", platform)).toEqual({ kind: "domain", hostname: "www.feestband.nl" });
    expect(siteHost("app.stagedesk.nl", "stagedesk.site", platform)).toBeNull();
    expect(siteHost("localhost:3000", "localhost", platform)).toBeNull();
    expect(siteHost("www.stagedesk.site", "stagedesk.site", platform)).toBeNull();
    expect(siteHost("www.mijnbureau.localhost:3000", "localhost", platform)).toEqual({ kind: "domain", hostname: "www.mijnbureau.localhost" });
  });

  it("normalises what agencies type as their domain", () => {
    expect(normalizeHostname("https://WWW.Feestband.nl/contact")).toBe("www.feestband.nl");
    expect(normalizeHostname("feestband.nl.")).toBe("feestband.nl");
    expect(normalizeHostname("not a domain")).toBeNull();
    expect(normalizeHostname("localhost")).toBeNull();
    expect(normalizeHostname("-bad-.nl")).toBeNull();
  });
});

describe("site sections", () => {
  it("accepts the starter page and rejects unsafe links", () => {
    expect(sitePageContentSchema.safeParse(starterHome("Feestband Utrecht", "Utrecht")).success).toBe(true);
    const hero = { id: "h1", type: "hero", title: "Hi", ctaTarget: "url", ctaUrl: "javascript:alert(1)" };
    expect(sectionSchema.safeParse(hero).success).toBe(false);
    expect(sectionSchema.safeParse({ ...hero, ctaUrl: "https://example.nl" }).success).toBe(true);
    expect(sectionSchema.safeParse({ id: "g", type: "gallery", images: [{ url: "http://insecure.nl/a.jpg" }] }).success).toBe(false);
  });

  it("fills defaults so stored sections stay small", () => {
    const parsed = sectionSchema.parse({ id: "a", type: "artists" });
    expect(parsed).toMatchObject({ background: "default", heading: "", max: 6 });
  });
});
