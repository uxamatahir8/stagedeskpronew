import "server-only";

/** Verifies a Cloudflare Turnstile token. Without a secret configured, checks are skipped (and logged). */
export async function verifyTurnstile(token: string | null, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn("[turnstile] TURNSTILE_SECRET_KEY not set; skipping verification");
    return true;
  }
  if (!token) return false;
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch (error) {
    console.error("[turnstile] verification failed", error);
    return false;
  }
}

export const turnstileSiteKey = () => process.env.TURNSTILE_SITE_KEY ?? null;
