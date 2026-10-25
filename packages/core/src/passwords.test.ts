import { describe, expect, it } from "vitest";
import { passwordProblem, passwordStrength } from "./passwords";

describe("password rules", () => {
  it("names the first broken rule", () => {
    expect(passwordProblem("kort1")).toBe("short");
    expect(passwordProblem("a1".repeat(70))).toBe("long");
    expect(passwordProblem("1234567890")).toBe("letter");
    expect(passwordProblem("alleenletters")).toBe("number");
    expect(passwordProblem("StageDesk-demo-2026")).toBeNull();
    expect(passwordProblem("wachtwoord12")).toBeNull();
  });

  it("rates strength and gives tips", () => {
    expect(passwordStrength("").score).toBe(0);
    expect(passwordStrength("kort").score).toBe(1);
    expect(passwordStrength("aaaaaaaaaa1").score).toBe(1);
    expect(passwordStrength("wachtwoord12").score).toBeLessThanOrEqual(1);
    expect(passwordStrength("zomerfeest24").score).toBe(2);
    expect(passwordStrength("StageDesk-demo-2026").score).toBe(4);
    expect(passwordStrength("zomerfeest24").tips).toEqual(expect.arrayContaining(["case", "symbol"]));
  });
});
