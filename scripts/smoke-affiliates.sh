#!/usr/bin/env bash
# Affiliate program screens and link tracking. Needs `pnpm services:up`, `pnpm db:seed` and `pnpm dev:e2e`.
# Adds and removes its own click rows. Run: bash scripts/smoke-affiliates.sh
. "$(dirname "$0")/smoke-lib.sh"
CAMPAIGN="smoke$(date +%s)"
trap 'sql "delete from affiliate_clicks where campaign='"'"'$CAMPAIGN'"'"'"' EXIT

c=$(signin_admin padmin); [ "$c" = 200 ] || bad "sign-in admin" "got $c"
need_signin aff partner@stagedesk.local; need_signin owner eigenaar@feestband.local

echo "Public"
has "partner page shows the program" "" /partners "Earn every month for every agency"
has "partner page shows tiers" "" /partners "Elite"

echo "Link tracking"
clicks() { sql "select count(*) from affiliate_clicks c join affiliates a on a.id=c.affiliateId where a.code='pim' and c.campaign='$CAMPAIGN'"; }
cookie=$(curl -s -m 60 -D - -o /dev/null -H "User-Agent: smoke-$RANDOM" "$B/?via=pim&c=$CAMPAIGN" | grep -i "set-cookie: sd_via")
echo "$cookie" | grep -q "sd_via=pim.$CAMPAIGN." && ok "?via sets the referral cookie" || bad "?via sets the referral cookie" "$cookie"
for _ in 1 2 3 4 5 6 7 8 9 10; do after=$(clicks); [ "$after" -gt 0 ] && break; sleep 1; done
[ "$after" -gt 0 ] && ok "click is logged with its campaign" || bad "click is logged" "$after"
curl -s -m 60 -D - -o /dev/null "$B/?via=bad%3Cscript%3E" | grep -qi "set-cookie: sd_via" && bad "invalid code is ignored" "cookie set" || ok "invalid code is ignored"
c=$(curl -s -m 60 -o /dev/null -w '%{http_code}' -X POST -H "Content-Type: application/json" -d '{"code":"pim"}' "$B/api/affiliates/click")
[ "$c" = 403 ] && ok "click endpoint refuses outside calls" || bad "click endpoint refuses outside calls" "$c"

echo "Affiliate"
has "home shows the funnel" aff /app "Your funnel"
has "home shows paying agencies" aff /app "Paying agencies"
has "links page shows the promo code" aff /app/links "PIM20"
has "links page shows assets" aff /app/links "Email text for agencies"
has "payouts list commissions" aff /app/payouts "Rotterdam DJ Collectief"
refused "affiliate refused on the admin list" aff /app/affiliates

echo "Platform admin"
has "affiliates list" padmin /app/affiliates "Pim Partner"
has "affiliates materials" padmin "/app/affiliates?tab=partners" "Email text for agencies"
has "program settings" padmin /app/settings "Affiliate program"

echo "Agency"
has "billing shows give-a-month link" owner /app/billing "r-fb2026"
refused "agency owner refused on affiliates" owner /app/affiliates "Pim Partner"

finish
