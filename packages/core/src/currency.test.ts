import { describe, expect, it } from "vitest";
import { convertCents, parseEcbRates, parseOpenRates } from "./currency";

const sample = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <Cube>
    <Cube time='2026-10-23'>
      <Cube currency='USD' rate='1.0812'/>
      <Cube currency='JPY' rate='162.50'/>
      <Cube currency='GBP' rate='0.8345'/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

describe("currency", () => {
  it("reads the ECB file and keeps supported currencies", () => {
    expect(parseEcbRates(sample)).toEqual({ date: "2026-10-23", rates: { USD: 1.0812, GBP: 0.8345 } });
    expect(parseEcbRates("<nothing/>")).toBeNull();
  });

  it("converts through the euro in whole cents", () => {
    const rates = { USD: 1.0812, GBP: 0.8345 };
    expect(convertCents(10_000, "EUR", "USD", rates)).toBe(10_812);
    expect(convertCents(10_812, "USD", "EUR", rates)).toBe(10_000);
    expect(convertCents(10_000, "USD", "GBP", rates)).toBe(7_718);
    expect(convertCents(500, "EUR", "EUR", {})).toBe(500);
    expect(convertCents(500, "EUR", "CHF", rates)).toBeNull();
  });
});

describe("parseOpenRates", () => {
  it("keeps supported currencies from a EUR-based answer", () => {
    const parsed = parseOpenRates({ result: "success", base_code: "EUR", time_last_update_unix: 1_792_886_400, rates: { EUR: 1, PKR: 321.5, XYZ: 4, AED: 4.27 } });
    expect(parsed?.rates).toEqual({ PKR: 321.5, AED: 4.27 });
    expect(parsed?.date).toBe("2026-10-25");
  });
  it("refuses errors and other bases", () => {
    expect(parseOpenRates({ result: "error" })).toBeNull();
    expect(parseOpenRates({ result: "success", base_code: "USD", rates: { PKR: 280 } })).toBeNull();
  });
});
