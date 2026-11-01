import "server-only";

/**
 * Whether Turnstile may be skipped: in development without keys, or in
 * production only when TURNSTILE_DISABLED=true says so on purpose. A missing
 * secret in production otherwise fails closed (forms refuse), and the
 * production config check (instrumentation) reports it at start-up.
 */
export function turnstileOptional() {
  return process.env.NODE_ENV !== "production" || process.env.TURNSTILE_DISABLED === "true";
}

/** Verifies a Cloudflare Turnstile token. */
export async function verifyTurnstile(token: string | null, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (turnstileOptional()) {
      console.warn("[turnstile] TURNSTILE_SECRET_KEY not set; skipping verification");
      return true;
    }
    console.error("[turnstile] TURNSTILE_SECRET_KEY is not set in production; refusing the submission");
    return false;
  }
  if (!token) return false;
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      // A hanging check mustn't hold the request; failing closed is the safe side.
      signal: AbortSignal.timeout(5_000),
    });
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch (error) {
    console.error("[turnstile] verification failed", error);
    return false;
  }
}

export const turnstileSiteKey = () => process.env.TURNSTILE_SITE_KEY ?? null;
