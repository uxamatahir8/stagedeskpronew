import { createHash, timingSafeEqual } from "node:crypto";
import { recordAffiliateClick } from "@stagedesk/db";
import { allow } from "@/lib/rate-limit";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Logs a referral link click. Only the proxy calls this (with the auth
 * secret); a visitor is counted at most a few times an hour per code.
 */
export async function POST(request: Request) {
  const secret = process.env.BETTER_AUTH_SECRET ?? "";
  if (!secret || !same(request.headers.get("x-internal") ?? "", secret)) return new Response(null, { status: 403 });

  const body = (await request.json().catch(() => null)) as { code?: unknown; campaign?: unknown; path?: unknown } | null;
  if (typeof body?.code !== "string") return new Response(null, { status: 400 });

  const ip = request.headers.get("x-visitor-ip") ?? "unknown";
  const agent = request.headers.get("x-visitor-agent") ?? "";
  const visitorHash = createHash("sha256").update(`${secret}:${ip}:${agent}`).digest("hex");
  if (!(await allow(`affiliate-click:${body.code}:${visitorHash}`, 3, 3600))) return new Response(null, { status: 204 });

  await recordAffiliateClick({
    code: body.code,
    campaign: typeof body.campaign === "string" ? body.campaign : null,
    landingPath: typeof body.path === "string" ? body.path : null,
    visitorHash,
  });
  return new Response(null, { status: 204 });
}
