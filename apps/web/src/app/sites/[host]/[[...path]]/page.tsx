import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { SiteFooter, SiteFrame, SiteHeader, SiteSection } from "@/components/sites/site-sections";
import { loadSiteData } from "@/lib/site-data";
import { pageForPath, showBranding, siteForHost, siteHref, siteOrigin } from "@/lib/site-request";

type Props = { params: Promise<{ host: string; path?: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const { host, path = [] } = await params;
  const site = await siteForHost(host);
  const found = site && pageForPath(site, path);
  if (!site || !found) return { title: "Not found", robots: { index: false } };
  const { content, lang, page } = found;
  const title = content.seoTitle || (page.slug === "" ? site.organization.name : `${content.title} · ${site.organization.name}`);
  const origin = siteOrigin(host);
  return {
    title: { absolute: title },
    description: content.seoDescription || undefined,
    alternates: { canonical: `${origin}${siteHref(lang, page.slug)}` },
    openGraph: { title, description: content.seoDescription || undefined, siteName: site.organization.name, locale: lang === "en" ? "en_GB" : "nl_NL", type: "website" },
    icons: site.organization.logo ? { icon: site.organization.logo } : undefined,
  };
}

export default function SitePage({ params }: Props) {
  return (
    <Suspense fallback={<div className="min-h-svh bg-white" />}>
      <Site params={params} />
    </Suspense>
  );
}

async function Site({ params }: Props) {
  await connection();
  const { host, path = [] } = await params;
  const site = await siteForHost(host);
  const found = site && pageForPath(site, path);
  if (!site || !found) notFound();
  const { content, lang, page } = found;
  setRequestLocale(lang);
  const [data, messages, branding] = await Promise.all([loadSiteData(site.organization.id), getMessages({ locale: lang }), showBranding(site.organization.id)]);

  // The booking form is a section on the home page when there is one; otherwise the agency's booking page.
  const home = site.pages.find((p) => p.slug === "");
  const bookingSection = (home?.content[lang] ?? home?.content.nl)?.sections.find((s) => s.type === "booking");
  const contactSection = site.pages.flatMap((p) => (p.content[lang] ?? p.content.nl).sections.map((s) => ({ s, slug: p.slug }))).find((x) => x.s.type === "contact");
  const ctaHref = bookingSection ? `${siteHref(lang, "")}#${bookingSection.id}` : `/b/${site.organization.slug}`;
  const contactHref = contactSection ? `${siteHref(lang, contactSection.slug)}#${contactSection.s.id}` : ctaHref;
  const nav = site.pages
    .filter((p) => p.inNav)
    .map((p) => ({ href: siteHref(lang, p.slug), label: (p.content[lang] ?? p.content.nl).title, current: p.slug === page.slug }));
  const otherLang = lang === "nl" ? "en" : "nl";
  const langSwitch = site.englishEnabled && page.content.en ? { href: siteHref(otherLang, page.slug), label: otherLang === "en" ? (lang === "nl" ? "Engels" : "English") : lang === "en" ? "Dutch" : "Nederlands" } : null;

  return (
    <NextIntlClientProvider locale={lang} messages={messages} timeZone="Europe/Amsterdam">
      <SiteFrame theme={site.theme} className="flex min-h-svh flex-col">
        <div lang={lang} className="flex flex-1 flex-col">
          <SiteHeader data={data} theme={site.theme} nav={nav} ctaHref={ctaHref} langSwitch={langSwitch} />
          <main className="flex-1">
            {content.sections.map((section) => (
              <SiteSection key={section.id} section={section} data={data} theme={site.theme} ctaHref={ctaHref} contactHref={contactHref} />
            ))}
          </main>
          <SiteFooter data={data} branding={branding} />
        </div>
      </SiteFrame>
    </NextIntlClientProvider>
  );
}
