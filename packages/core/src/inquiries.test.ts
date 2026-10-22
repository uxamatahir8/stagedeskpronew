import { describe, expect, it } from "vitest";
import { fullyBookedDates, isBudgetRange, mediaEmbed } from "./inquiries";

describe("mediaEmbed", () => {
  it("embeds YouTube in its privacy mode", () => {
    for (const link of ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ", "https://youtube.com/shorts/dQw4w9WgXcQ"]) {
      expect(mediaEmbed(link)?.embedUrl).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    }
  });

  it("embeds Vimeo, SoundCloud and Mixcloud", () => {
    expect(mediaEmbed("https://vimeo.com/76979871")?.embedUrl).toBe("https://player.vimeo.com/video/76979871");
    expect(mediaEmbed("https://soundcloud.com/djsem/summer-mix")?.embedUrl).toContain("w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fdjsem%2Fsummer-mix");
    expect(mediaEmbed("https://www.mixcloud.com/djsem/house-set/")?.provider).toBe("mixcloud");
  });

  it("refuses other sites, plain http and malformed links", () => {
    expect(mediaEmbed("https://evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(mediaEmbed("http://youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(mediaEmbed("javascript:alert(1)")).toBeNull();
    expect(mediaEmbed("not a url")).toBeNull();
    expect(mediaEmbed("https://youtube.com/watch?v=<script>")).toBeNull();
    expect(mediaEmbed("https://soundcloud.com/only-user")).toBeNull();
  });
});

describe("fullyBookedDates", () => {
  const busy = new Map([
    ["2027-06-12", new Set(["a", "b"])],
    ["2027-06-13", new Set(["a"])],
    ["2027-06-01", new Set(["b", "a", "x"])],
  ]);

  it("lists only dates on which every artist is busy", () => {
    expect(fullyBookedDates(["a", "b"], busy)).toEqual(["2027-06-01", "2027-06-12"]);
  });

  it("treats an agency without artists as never fully booked", () => {
    expect(fullyBookedDates([], busy)).toEqual([]);
  });
});

describe("budget ranges", () => {
  it("recognises known keys only", () => {
    expect(isBudgetRange("750_1500")).toBe(true);
    expect(isBudgetRange("1000000")).toBe(false);
  });
});
