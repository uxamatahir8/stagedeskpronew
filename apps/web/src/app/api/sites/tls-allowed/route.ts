import { connection } from "next/server";
import { siteHost } from "@stagedesk/core";
import { isServedDomain, prisma } from "@stagedesk/db";
import { sitesBase } from "@/lib/site-request";

/**
 * For the reverse proxy's on-demand TLS (Caddy `ask`): answers 200 only for
 * hostnames StageDesk serves (verified custom domains and existing agency
 * subdomains), so certificates are never issued for random names.
 */
export async function GET(request: Request) {
  await connection();
  const domain = new URL(request.url).searchParams.get("domain")?.toLowerCase() ?? "";
  const info = siteHost(domain, sitesBase, []);
  if (!info) return new Response(null, { status: 404 });
  const ok = info.kind === "domain" ? await isServedDomain(info.hostname) : (await prisma.organization.count({ where: { slug: info.slug, suspendedAt: null } })) > 0;
  return new Response(null, { status: ok ? 200 : 404 });
}
