import type { MetadataRoute } from "next";
import { indexingAllowed } from "@/lib/indexing";
import { appUrl } from "@/lib/mail";

/** The dashboard, quote links and APIs stay out of search engines; everything public is crawlable. */
export default function robots(): MetadataRoute.Robots {
  // Staging and test servers: nothing may be indexed.
  if (!indexingAllowed()) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/nl/app", "/q/", "/nl/q/", "/api/", "/onboarding", "/nl/onboarding", "/invite/", "/nl/invite/", "/embed/", "/nl/embed/"] }],
    sitemap: `${appUrl}/sitemap.xml`,
    host: appUrl,
  };
}
