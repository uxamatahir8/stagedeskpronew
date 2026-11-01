import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./redirects";

describe("safeRedirectPath", () => {
  it("keeps same-site paths with their query", () => {
    expect(safeRedirectPath("/app/team")).toBe("/app/team");
    expect(safeRedirectPath("/invite/abc?x=1#y")).toBe("/invite/abc?x=1#y");
    expect(safeRedirectPath("/nl/app")).toBe("/nl/app");
  });

  it("refuses other sites and non-paths", () => {
    for (const value of ["//evil.example", "https://evil.example", "evil.example", "javascript:alert(1)", "", null, undefined]) {
      expect(safeRedirectPath(value)).toBeNull();
    }
  });

  it("refuses paths that browsers turn into another site", () => {
    // Tabs and newlines are dropped and "\" reads as "/": all of these would land on evil.example.
    for (const value of ["/\t/evil.example", "/\n/evil.example", "/\r\n/evil.example", "/\\evil.example", "/\\/evil.example", "/x\u0000"]) {
      expect(safeRedirectPath(value)).toBeNull();
    }
  });
});
