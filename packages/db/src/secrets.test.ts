import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "./client";
import { decryptSecret, deleteSecret, encryptSecret, getSecret, secretHint, secretHints, setSecret } from "./secrets";

afterAll(async () => {
  await deleteSecret("stripe.webhookSecret");
});

describe("platform secrets", () => {
  it("encrypts with a fresh IV each time and decrypts back", () => {
    const a = encryptSecret("sk_test_51AbcDefGhi4242");
    const b = encryptSecret("sk_test_51AbcDefGhi4242");
    expect(a).not.toBe(b);
    expect(a).not.toContain("sk_test");
    expect(decryptSecret(a)).toBe("sk_test_51AbcDefGhi4242");
  });

  it("treats a tampered value as unreadable", () => {
    const [iv, tag, data] = encryptSecret("whsec_abcdefghijkl").split(".");
    const flipped = Buffer.from(data!, "base64");
    flipped[0] = flipped[0]! ^ 1;
    expect(decryptSecret([iv, tag, flipped.toString("base64")].join("."))).toBeNull();
  });

  it("shows only a hint", () => {
    expect(secretHint("sk_live_51AbcDefGhi4242")).toBe("sk_live_…4242");
    expect(secretHint("whsec_abcdefghijkl")).toBe("whse…ijkl");
  });

  it("stores, replaces and removes a secret; the table never holds the plain value", async () => {
    await setSecret("stripe.webhookSecret", " whsec_first123456 ", null);
    await setSecret("stripe.webhookSecret", "whsec_second123456", null);
    expect(await getSecret("stripe.webhookSecret")).toBe("whsec_second123456");
    const row = await prisma.platformSecret.findUniqueOrThrow({ where: { key: "stripe.webhookSecret" } });
    expect(row.ciphertext).not.toContain("whsec_");
    expect((await secretHints())["stripe.webhookSecret"]?.hint).toBe("whse…3456");
    await deleteSecret("stripe.webhookSecret");
    expect(await getSecret("stripe.webhookSecret")).toBeNull();
  });
});
