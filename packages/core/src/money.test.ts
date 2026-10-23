import { describe, expect, it } from "vitest";
import { formatIban, isValidIban, normalizeIban } from "./money";

describe("IBAN", () => {
  it("accepts valid IBANs however they're typed", () => {
    expect(isValidIban("NL91ABNA0417164300")).toBe(true);
    expect(isValidIban("nl91 abna 0417 1643 00")).toBe(true);
    expect(isValidIban("BE68539007547034")).toBe(true);
    expect(isValidIban("DE89370400440532013000")).toBe(true);
  });

  it("rejects wrong check digits, lengths and characters", () => {
    expect(isValidIban("NL92ABNA0417164300")).toBe(false);
    expect(isValidIban("NL91ABNA041716430")).toBe(false);
    expect(isValidIban("NL91-ABNA-0417")).toBe(false);
    expect(isValidIban("")).toBe(false);
  });

  it("normalises and formats in groups of four", () => {
    expect(normalizeIban(" nl91 abna 0417 1643 00 ")).toBe("NL91ABNA0417164300");
    expect(formatIban("NL91ABNA0417164300")).toBe("NL91 ABNA 0417 1643 00");
  });
});
