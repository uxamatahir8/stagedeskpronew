import { describe, expect, it } from "vitest";
import { iconKind, normalizeHostname, parseSiteTheme, sectionSchema, siteHost, sitePageContentSchema, sitePresets, siteThemeSchema, starterHome } from "./sites";

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

describe("site icons", () => {
  it("accepts built-in icons, emoji and safe images, and nothing else", () => {
    expect(iconKind("")).toBe("none");
    expect(iconKind("guitar")).toBe("builtin");
    expect(iconKind("🎉")).toBe("emoji");
    expect(iconKind("👍🏽")).toBe("emoji");
    expect(iconKind("/files/organizations/x/icon.png")).toBe("image");
    expect(iconKind("<svg onload=alert(1)>")).toBeNull();
    expect(iconKind("javascript:alert(1)")).toBeNull();
    expect(iconKind("not-an-icon")).toBeNull();
  });
});

describe("pre-built sections", () => {
  it("fills defaults for the new blocks", () => {
    const cards = sectionSchema.parse({ id: "c", type: "cards", items: [{ title: "Bruiloften" }] });
    expect(cards).toMatchObject({ layout: "grid", columns: 3, items: [{ icon: "", image: "", body: "", linkUrl: "" }] });
    expect(sectionSchema.parse({ id: "d", type: "divider" })).toMatchObject({ style: "line", background: "default" });
  });

  it("keeps links to safe places", () => {
    const card = (linkUrl: string) => sectionSchema.safeParse({ id: "c", type: "cards", items: [{ title: "x", linkUrl }] }).success;
    expect(card("https://example.nl")).toBe(true);
    expect(card("/over-ons")).toBe(true);
    expect(card("#boeken")).toBe(true);
    expect(card("mailto:info@example.nl")).toBe(true);
    expect(card("javascript:alert(1)")).toBe(false);
    expect(card("data:text/html,hi")).toBe(false);
  });

  it("checks icons and background images", () => {
    expect(sectionSchema.safeParse({ id: "s", type: "stats", items: [{ value: "500+", icon: "🎧" }] }).success).toBe(true);
    expect(sectionSchema.safeParse({ id: "s", type: "stats", items: [{ value: "500+", icon: "<b>" }] }).success).toBe(false);
    expect(sectionSchema.safeParse({ id: "b", type: "cta", heading: "Hi", background: "image", backgroundImage: "http://insecure.nl/a.jpg" }).success).toBe(false);
  });
});

describe("site themes", () => {
  it("gives older themes the new settings", () => {
    const old = { primary: "#111111", accent: "#222222", font: "modern", radius: "soft", mode: "light" };
    expect(parseSiteTheme(old)).toMatchObject({ ...old, headingFont: "same", page: "light", buttons: "solid", cards: "outlined", spacing: "normal", headerLayout: "classic" });
  });

  it("only ships valid presets", () => {
    for (const preset of sitePresets) expect(siteThemeSchema.safeParse(preset.theme).success, preset.id).toBe(true);
  });
});
