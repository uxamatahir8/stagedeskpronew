import { describe, expect, it } from "vitest";
import { changeConflicts, conflictFingerprint, customerChangeMode, customerPreferencesOpen, playlistLink } from "./customer-event";

const today = "2027-05-10";

describe("customerPreferencesOpen", () => {
  it("is open for live bookings, dated ahead or undated", () => {
    for (const status of ["inquiry", "quoted", "expired", "booked", "confirmed"]) {
      expect(customerPreferencesOpen(status, "2027-06-01", today)).toBe(true);
      expect(customerPreferencesOpen(status, null, today)).toBe(true);
    }
    expect(customerPreferencesOpen("booked", today, today)).toBe(true);
  });

  it("closes once the event has passed or the booking is over", () => {
    expect(customerPreferencesOpen("confirmed", "2027-05-09", today)).toBe(false);
    for (const status of ["cancelled", "declined", "completed", "settled"]) expect(customerPreferencesOpen(status, "2027-06-01", today)).toBe(false);
  });
});

describe("customerChangeMode", () => {
  it("lets the customer change details themselves only before a quote is out", () => {
    expect(customerChangeMode("inquiry", "2027-06-01", today)).toBe("direct");
    expect(customerChangeMode("expired", null, today)).toBe("direct");
  });

  it("asks the agency once a quote is out or accepted", () => {
    for (const status of ["quoted", "booked", "confirmed"]) expect(customerChangeMode(status, "2027-06-01", today)).toBe("request");
  });

  it("is closed after the event and on finished bookings", () => {
    expect(customerChangeMode("confirmed", "2027-05-01", today)).toBe("closed");
    for (const status of ["cancelled", "declined", "completed", "settled"]) expect(customerChangeMode(status, "2027-06-01", today)).toBe("closed");
  });
});

describe("playlistLink", () => {
  it("accepts Spotify playlists, also with a language path or tracking query", () => {
    expect(playlistLink("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")?.provider).toBe("spotify");
    expect(playlistLink("https://open.spotify.com/intl-nl/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc")?.provider).toBe("spotify");
    expect(playlistLink(" https://spotify.link/AbCdEf ")?.provider).toBe("spotify");
  });

  it("turns a Spotify URI into its web address", () => {
    expect(playlistLink("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M")?.url).toBe("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M");
  });

  it("accepts the other music services", () => {
    expect(playlistLink("https://music.apple.com/nl/playlist/x/pl.abc")?.provider).toBe("apple_music");
    expect(playlistLink("https://www.youtube.com/playlist?list=PL1")?.provider).toBe("youtube");
    expect(playlistLink("https://soundcloud.com/dj/sets/mix")?.provider).toBe("soundcloud");
    expect(playlistLink("https://www.mixcloud.com/dj/mix/")?.provider).toBe("mixcloud");
    expect(playlistLink("https://tidal.com/browse/playlist/1")?.provider).toBe("tidal");
    expect(playlistLink("https://www.deezer.com/nl/playlist/1")?.provider).toBe("deezer");
  });

  it("refuses everything else", () => {
    for (const bad of [
      "",
      null,
      "javascript:alert(1)",
      "http://open.spotify.com/playlist/abc",
      "https://evil.example/playlist/abc",
      "https://open.spotify.com.evil.example/playlist/abc",
      "https://open.spotify.com@evil.example/playlist/abc",
      "https://user:pw@open.spotify.com/playlist/abc",
      "https://open.spotify.com:8443/playlist/abc",
      "https://open.spotify.com/track/abc",
      "https://open.spotify.com/playlist/<script>",
      "https://soundcloud.com/",
      "data:text/html,hi",
      `https://open.spotify.com/playlist/${"a".repeat(500)}`,
    ]) {
      expect(playlistLink(bad)).toBeNull();
    }
  });
});

describe("changeConflicts", () => {
  const now = { eventDate: "2027-06-20", venueCity: "Utrecht", guestCount: 100 };

  it("finds a field someone else changed since the customer asked", () => {
    expect(changeConflicts({ eventDate: "2027-06-15" }, { eventDate: "2027-06-10" }, now)).toEqual([{ field: "eventDate", original: "2027-06-10", requested: "2027-06-15", current: "2027-06-20" }]);
  });

  it("is not a conflict when nothing changed, or when another field did", () => {
    expect(changeConflicts({ eventDate: "2027-06-25" }, { eventDate: "2027-06-20" }, now)).toEqual([]);
    expect(changeConflicts({ guestCount: 120 }, { guestCount: 100 }, now)).toEqual([]);
  });

  it("is not a conflict when the booking already holds the requested value", () => {
    expect(changeConflicts({ eventDate: "2027-06-20" }, { eventDate: "2027-06-10" }, now)).toEqual([]);
  });

  it("compares like the quote snapshot: case, spaces and empty values don't count", () => {
    expect(changeConflicts({ venueCity: "Zeist" }, { venueCity: " utrecht " }, now)).toEqual([]);
    expect(changeConflicts({ venueName: "Tivoli" }, { venueName: "" }, { venueName: null })).toEqual([]);
  });

  it("doesn't depend on the order of the keys", () => {
    const a = changeConflicts({ eventDate: "2027-06-15", guestCount: 80 }, { guestCount: 90, eventDate: "2027-06-10" }, now);
    const b = changeConflicts({ guestCount: 80, eventDate: "2027-06-15" }, { eventDate: "2027-06-10", guestCount: 90 }, now);
    expect(a).toEqual(b);
    expect(a.map((c) => c.field)).toEqual(["eventDate", "guestCount"]);
  });

  it("gives a fingerprint that changes when the current value does", () => {
    const first = conflictFingerprint(changeConflicts({ eventDate: "2027-06-15" }, { eventDate: "2027-06-10" }, now));
    const second = conflictFingerprint(changeConflicts({ eventDate: "2027-06-15" }, { eventDate: "2027-06-10" }, { eventDate: "2027-07-01" }));
    expect(first).not.toBe(second);
  });
});
