import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/mail";

/** The dashboard, quote links and APIs stay out of search engines; everything public is crawlable. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/nl/app", "/q/", "/nl/q/", "/api/", "/onboarding", "/nl/onboarding", "/invite/", "/nl/invite/", "/embed/", "/nl/embed/"] }],
    sitemap: `${appUrl}/sitemap.xml`,
    host: appUrl,
  };
}
