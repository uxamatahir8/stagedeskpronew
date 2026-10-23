import { connection } from "next/server";
import { siteForHost, siteHref, siteOrigin } from "@/lib/site-request";

/** The sitemap of one agency site: every page in each language it has. */
export async function GET(_request: Request, { params }: { params: Promise<{ host: string }> }) {
  await connection();
  const { host } = await params;
  const site = await siteForHost(host);
  if (!site) return new Response("Not found", { status: 404 });
  const origin = siteOrigin(host);
  const urls = site.pages.flatMap((p) => [siteHref("nl", p.slug), ...(site.englishEnabled && p.content.en ? [siteHref("en", p.slug)] : [])]);
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${origin}${u}</loc></url>`).join("\n")}\n</urlset>\n`;
  return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
