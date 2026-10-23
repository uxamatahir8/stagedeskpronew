#!/usr/bin/env bash
# Affiliate program screens and link tracking (phase 6). Needs `pnpm services:up`, `pnpm db:seed` and `pnpm dev`.
# Run: bash scripts/smoke-affiliates.sh
B=http://localhost:3000
PW=StageDesk-demo-2026
D=$(mktemp -d)
H=(-H "Content-Type: application/json" -H "Origin: $B")
pass=0; fail=0
ok()   { echo "  PASS  $1"; pass=$((pass+1)); }
bad()  { echo "  FAIL  $1  ($2)"; fail=$((fail+1)); }
signin() { curl -s -c "$D/$1" "${H[@]}" -d "{\"email\":\"$2\",\"password\":\"$PW\"}" -o /dev/null -w '%{http_code}' $B/api/auth/sign-in/email; }
has() { # name cookie path text
  local body; body=$(curl -s -b "$D/$2" "$B$3")
  if echo "$body" | grep -q "$4"; then ok "$1"; else bad "$1" "missing: $4"; fi
}
blocked() { if curl -s -b "$D/$2" "$B$3" | grep -q "have access"; then ok "$1"; else bad "$1" "no 403 page"; fi; }
DOCKER=$(command -v docker || echo "/c/Program Files/Docker/Docker/resources/bin/docker.exe")
sql() { "$DOCKER" exec stagedesk-dev-mysql-1 mysql -N -ustagedesk -pstagedesk stagedesk -e "$1" 2>/dev/null; }

for pair in "padmin admin@stagedesk.local" "aff partner@stagedesk.local" "owner eigenaar@feestband.local"; do
  set -- $pair; c=$(signin $1 $2); [ "$c" = 200 ] || echo "sign-in $2 -> $c"
done

echo "Public"
has "partner page shows the program" none /en/partners "Earn every month for every agency"
has "partner page shows tiers" none /en/partners "Elite"

echo "Link tracking"
before=$(sql "select count(*) from affiliate_clicks c join affiliates a on a.id=c.affiliateId where a.code='pim' and c.campaign='smoke'")
cookie=$(curl -s -D - -o /dev/null -H "User-Agent: smoke-$RANDOM" "$B/en?via=pim&c=smoke" | grep -i "set-cookie: sd_via")
echo "$cookie" | grep -q "sd_via=pim.smoke." && ok "?via sets the referral cookie" || bad "?via sets the referral cookie" "$cookie"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  after=$(sql "select count(*) from affiliate_clicks c join affiliates a on a.id=c.affiliateId where a.code='pim' and c.campaign='smoke'")
  [ "$after" -gt "$before" ] && break; sleep 1
done
[ "$after" -gt "$before" ] && ok "click is logged with its campaign" || bad "click is logged" "$before -> $after"
curl -s -D - -o /dev/null "$B/en?via=bad%3Cscript%3E" | grep -qi "set-cookie: sd_via" && bad "invalid code is ignored" "cookie set" || ok "invalid code is ignored"
c=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Content-Type: application/json" -d '{"code":"pim"}' $B/api/affiliates/click)
[ "$c" = 403 ] && ok "click endpoint refuses outside calls" || bad "click endpoint refuses outside calls" "$c"

echo "Affiliate"
has "home shows the funnel" aff /en/app "Your funnel"
has "home shows paying agencies" aff /en/app "Paying agencies"
has "links page shows the promo code" aff /en/app/links "PIM20"
has "links page shows assets" aff /en/app/links "Email text for agencies"
has "payouts list commissions" aff /en/app/payouts "Rotterdam DJ Collectief"
blocked "affiliate can't open the admin list" aff /en/app/affiliates

echo "Platform admin"
has "affiliates list" padmin /en/app/affiliates "Pim Partner"
has "affiliates materials" padmin /en/app/affiliates "Email text for agencies"
has "program settings" padmin /en/app/settings "Affiliate program"

echo "Agency"
has "billing shows give-a-month link" owner /en/app/billing "r-fb2026"
blocked "agency owner can't open affiliates" owner /en/app/affiliates

echo; echo "$pass passed, $fail failed"
