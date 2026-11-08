import { describe, expect, it } from "vitest";
import { eventTimeRange } from "./event-times";

describe("event times", () => {
  it("marks an end after midnight as the next day", () => {
    expect(eventTimeRange("20:00", "23:30", "(+1 day)")).toBe("20:00 – 23:30");
    expect(eventTimeRange("22:00", "02:00", "(+1 day)")).toBe("22:00 – 02:00 (+1 day)");
    expect(eventTimeRange("22:00", "20:00", "(+1 dag)", "–")).toBe("22:00–20:00 (+1 dag)");
    expect(eventTimeRange("20:00", null, "(+1 day)")).toBe("20:00");
    expect(eventTimeRange(null, "02:00", "(+1 day)")).toBeNull();
  });
});
