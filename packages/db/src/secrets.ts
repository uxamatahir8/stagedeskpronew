import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { prisma } from "./client";

/**
 * Credentials entered in the dashboard, encrypted at rest with AES-256-GCM.
 * The key comes from SECRETS_KEY (or, failing that, BETTER_AUTH_SECRET):
 * changing it makes stored secrets unreadable, and they must be entered again.
 */
export const secretKeys = ["stripe.secretKey", "stripe.publishableKey", "stripe.webhookSecret"] as const;
export type SecretKey = (typeof secretKeys)[number];

function encryptionKey() {
  const material = process.env["SECRETS_KEY"] || process.env["BETTER_AUTH_SECRET"];
  if (!material) throw new Error("Set SECRETS_KEY (or BETTER_AUTH_SECRET) to store secrets");
  return createHash("sha256").update(material).digest();
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(stored: string): string | null {
  try {
    const [iv, tag, data] = stored.split(".").map((p) => Buffer.from(p, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv!);
    decipher.setAuthTag(tag!);
    return Buffer.concat([decipher.update(data!), decipher.final()]).toString("utf8");
  } catch {
    // Wrong key or tampered value: treat as not set.
    return null;
  }
}

/** "sk_test_51Ab…4242": enough to recognise a key, never enough to use it. */
export function secretHint(value: string) {
  const prefix = value.match(/^[a-z]+_(?:test|live)_/)?.[0] ?? value.slice(0, 4);
  return `${prefix}…${value.slice(-4)}`;
}

export async function setSecret(key: SecretKey, value: string, actorId: string | null) {
  const trimmed = value.trim();
  return prisma.platformSecret.upsert({
    where: { key },
    update: { ciphertext: encryptSecret(trimmed), hint: secretHint(trimmed), updatedById: actorId },
    create: { key, ciphertext: encryptSecret(trimmed), hint: secretHint(trimmed), updatedById: actorId },
  });
}

export async function getSecret(key: SecretKey) {
  const row = await prisma.platformSecret.findUnique({ where: { key } });
  return row ? decryptSecret(row.ciphertext) : null;
}

export async function deleteSecret(key: SecretKey) {
  await prisma.platformSecret.deleteMany({ where: { key } });
}

/** What the settings screen may show: which secrets exist, their hints and when they changed. */
export async function secretHints() {
  const rows = await prisma.platformSecret.findMany({ where: { key: { in: [...secretKeys] } }, select: { key: true, hint: true, updatedAt: true } });
  return Object.fromEntries(rows.map((r) => [r.key, { hint: r.hint, updatedAt: r.updatedAt }])) as Partial<Record<SecretKey, { hint: string; updatedAt: Date }>>;
}
