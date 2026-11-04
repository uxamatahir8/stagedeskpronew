#!/usr/bin/env bash
# Public website, SEO files, page builder access and legal pages. Read-only.
# Needs `pnpm services:up`, `pnpm db:seed`, `pnpm db:seed-showcase` and `pnpm dev:e2e`. Run: bash scripts/smoke-website.sh
. "$(dirname "$0")/smoke-lib.sh"

echo "Pages"
# English has no prefix, Dutch lives under /nl.
for p in / /nl /features /pricing /for-agencies /for-artists /partners /blog /help /changelog /contact /nl/pricing /nl/blog/aanbetaling-en-uitbetaling /nl/help/online-betalingen /about /nl/about /features/booking-page /features/quotes-invoices /features/payments-payouts /features/artist-management /solutions/weddings-events /solutions/band-agencies /nl/solutions/band-agencies /request /nl/request /tour /nl/tour /screens/nl/dashboard.webp /screens/en/hero-collage.webp; do
  c=$(code "" "$p"); [ "$c" = 200 ] && ok "$p 200" || bad "$p" "$c"
done
for p in /en /en/pricing; do
  c=$(curl -s -m 60 -o /dev/null -w '%{http_code} %{redirect_url}' "$B$p"); [ "$c" = "307 $B${p#/en}" ] || [ "$c" = "307 $B/" ] && ok "$p redirects to the address without a prefix" || bad "$p redirect" "$c"
done
has "pricing shows the recommended plan" "" /nl/pricing "Meest gekozen"
has "home shows its headline" "" / "From inquiry to payout"
has "Dutch terms" "" /nl/algemene-voorwaarden "Laatst bijgewerkt"
has "English terms" "" /terms "Last updated"
has "feature page in Dutch" "" /nl/features/quotes-invoices "Offertes en facturen voor je bureau"
has "about page" "" /about "Why we built StageDesk"
raw_has "FAQ structured data" /solutions/weddings-events "FAQPage"
raw_has "sitemap lists solutions" /sitemap.xml "/solutions/band-agencies"
has "request page" "" /nl/request "Vind de juiste"
has "tour" "" /nl/tour "een bureau runt"
# Agency websites on their free subdomain (curl resolves *.localhost itself).
S=http://feestband-utrecht.localhost:3000
curl -s -m 60 "$S/" | grep -q "Offerte aanvragen" && ok "agency site serves on its subdomain" || bad "agency site" "missing (pnpm db:seed-showcase restores it)"
curl -s -m 60 "$S/sitemap.xml" | grep -q "<urlset" && ok "agency site sitemap" || bad "agency site sitemap" "missing"
[ "$(curl -s -m 60 -o /dev/null -w '%{http_code}' "$B/api/sites/tls-allowed?domain=feestband-utrecht.localhost")" = 200 ] && ok "TLS ask allows a known subdomain" || bad "TLS ask" "refused"
[ "$(curl -s -m 60 -o /dev/null -w '%{http_code}' "$B/api/sites/tls-allowed?domain=www.not-ours.example")" = 404 ] && ok "TLS ask refuses unknown domains" || bad "TLS ask" "allowed"
has "home shows the look inside" "" /nl "Een kijkje binnen"
nf2=$(curl -s -m 60 "$B/features/does-not-exist"); echo "$nf2" | grep -q 'content="noindex"' && ok "unknown feature page is a noindex 404" || bad "unknown feature page" "no noindex"
# Builder pages are looked up while streaming, so an unknown address is a not-found page marked noindex.
nf=$(curl -s -m 60 "$B/does-not-exist"); echo "$nf" | grep -q 'content="noindex"' && echo "$nf" | grep -q 'NEXT_HTTP_ERROR_FALLBACK;404' && ok "unknown page is a noindex 404" || bad "unknown page" "no noindex 404"

echo "SEO"
html=$(curl -s -m 60 "$B/pricing")
echo "$html" | grep -q 'rel="canonical" href="[^"]*/pricing"' && ok "canonical link" || bad "canonical link" "missing"
echo "$html" | grep -qi 'hrefLang="nl"' && ok "hreflang links" || bad "hreflang links" "missing"
echo "$html" | grep -q 'og:image' && ok "Open Graph image" || bad "Open Graph image" "missing"
echo "$html" | grep -q '"@type":"SoftwareApplication"' && ok "structured data on pricing" || bad "structured data" "missing"
raw_has "structured data on posts" /nl/blog/offertes-die-worden-geaccepteerd '"@type":"BlogPosting"'
raw_has "sitemap lists builder pages in both languages" /sitemap.xml "/nl/about"
raw_has "robots keeps the dashboard out" /robots.txt "Disallow: /app"
c=$(curl -s -m 60 -o /dev/null -w '%{http_code} %{content_type}' "$B/api/og?title=Hallo"); [[ "$c" == "200 image/png"* ]] && ok "OG image renders" || bad "OG image" "$c"

echo "Access"
c=$(signin_admin padmin); [ "$c" = 200 ] || bad "sign-in admin" "got $c"
need_signin owner eigenaar@feestband.local
refused "owner refused on the page builder" owner /app/pages
has "admin opens the page builder" padmin /app/pages "algemene-voorwaarden\|terms"
c=$(curl -s -m 60 -b "$D/owner" -o /dev/null -w '%{http_code}' "$B/api/export/waitlist"); [ "$c" = 403 ] && ok "owner can't export the waitlist" || bad "owner waitlist export" "$c"
c=$(curl -s -m 60 -b "$D/padmin" -o /dev/null -w '%{http_code}' "$B/api/export/waitlist"); [ "$c" = 200 ] && ok "admin exports the waitlist" || bad "admin waitlist export" "$c"

finish
