import { connection } from "next/server";
import { siteForHost, siteOrigin } from "@/lib/site-request";

export async function GET(_request: Request, { params }: { params: Promise<{ host: string }> }) {
  await connection();
  const { host } = await params;
  const site = await siteForHost(host);
  const body = site ? `User-agent: *\nAllow: /\nSitemap: ${siteOrigin(host)}/sitemap.xml\n` : "User-agent: *\nDisallow: /\n";
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
