#!/usr/bin/env bash
# Public website, SEO files, page builder access and legal pages (phase 8).
# Needs `pnpm services:up`, `pnpm db:seed` and `pnpm dev`. Run: bash scripts/smoke-website.sh
B=http://localhost:3000
PW=StageDesk-demo-2026
D=$(mktemp -d)
H=(-H "Content-Type: application/json" -H "Origin: $B")
pass=0; fail=0
ok()   { echo "  PASS  $1"; pass=$((pass+1)); }
bad()  { echo "  FAIL  $1  ($2)"; fail=$((fail+1)); }
code() { curl -s -o /dev/null -w '%{http_code}' -b "$D/${2:-none}" "$B$1"; }
has()  { if curl -s -b "$D/${3:-none}" "$B$1" | grep -q "$2"; then ok "$1 shows \"$2\""; else bad "$1" "missing: $2"; fi; }
signin() { curl -s -c "$D/$1" "${H[@]}" -d "{\"email\":\"$2\",\"password\":\"$PW\"}" -o /dev/null -w '%{http_code}' $B/api/auth/sign-in/email; }

echo "Pages"
for p in / /en /features /pricing /for-agencies /for-artists /partners /blog /help /changelog /contact /en/pricing /en/blog/aanbetaling-en-uitbetaling /help/online-betalingen /about /en/about /features/booking-page /features/quotes-invoices /features/payments-payouts /features/artist-management /solutions/weddings-events /solutions/band-agencies /en/solutions/band-agencies /request /en/request /tour /en/tour /screens/nl/dashboard.webp /screens/en/hero-collage.webp; do
  c=$(code "$p"); [ "$c" = 200 ] && ok "$p 200" || bad "$p" "$c"
done
has /pricing "Meest gekozen"
has /en "From inquiry to payout"
has /algemene-voorwaarden "Laatst bijgewerkt"
has /en/terms "Last updated"
has /features/quotes-invoices "Offertes en facturen voor je bureau"
has /en/about "Why we built StageDesk"
has /solutions/weddings-events "FAQPage"
has /sitemap.xml "/solutions/band-agencies"
has /request "Vind de juiste"
has /tour "een bureau runt"
has / "Een kijkje binnen"
nf2=$(curl -s "$B/features/does-not-exist"); echo "$nf2" | grep -q 'content="noindex"' && ok "unknown feature page is a noindex 404" || bad "unknown feature page" "no noindex"
# Builder pages are looked up while streaming, so an unknown address is a not-found page marked noindex.
nf=$(curl -s "$B/does-not-exist"); echo "$nf" | grep -q 'content="noindex"' && echo "$nf" | grep -q "404" && ok "unknown page is a noindex 404" || bad "unknown page" "no noindex 404"

echo "SEO"
html=$(curl -s "$B/pricing")
echo "$html" | grep -q 'rel="canonical" href="[^"]*/pricing"' && ok "canonical link" || bad "canonical link" "missing"
echo "$html" | grep -q 'hrefLang="en"' && ok "hreflang links" || bad "hreflang links" "missing"
echo "$html" | grep -q 'og:image' && ok "Open Graph image" || bad "Open Graph image" "missing"
echo "$html" | grep -q '"@type":"SoftwareApplication"' && ok "structured data on pricing" || bad "structured data" "missing"
curl -s "$B/blog/offertes-die-worden-geaccepteerd" | grep -q '"@type":"BlogPosting"' && ok "structured data on posts" || bad "BlogPosting" "missing"
curl -s "$B/sitemap.xml" | grep -q "/en/about" && ok "sitemap lists builder pages in both languages" || bad "sitemap" "missing /en/about"
curl -s "$B/robots.txt" | grep -q "Disallow: /app" && ok "robots keeps the dashboard out" || bad "robots" "no /app rule"
c=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' "$B/api/og?title=Hallo"); [[ "$c" == "200 image/png"* ]] && ok "OG image renders" || bad "OG image" "$c"

echo "Access"
signin padmin admin@stagedesk.local >/dev/null; signin owner eigenaar@feestband.local >/dev/null
c=$(code /app/pages owner); body=$(curl -s -b "$D/owner" "$B/en/app/pages"); echo "$body" | grep -q "have access\|Updated terms" && ok "owner can't open the page builder" || bad "owner page builder" "$c"
c=$(curl -s -b "$D/owner" -o /dev/null -w '%{http_code}' $B/api/export/waitlist); [ "$c" = 403 ] && ok "owner can't export the waitlist" || bad "owner waitlist export" "$c"
c=$(curl -s -b "$D/padmin" -o /dev/null -w '%{http_code}' $B/api/export/waitlist); [ "$c" = 200 ] && ok "admin exports the waitlist" || bad "admin waitlist export" "$c"

echo; echo "$pass passed, $fail failed"
