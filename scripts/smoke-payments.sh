#!/usr/bin/env bash
# Payments and billing screens by role (phase 5). Needs `pnpm services:up`, `pnpm db:seed` and `pnpm dev`.
# Run: bash scripts/smoke-payments.sh
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
  if echo "$body" | grep -q "$4"; then ok "$1"; else
    bad "$1" "missing: $4"; echo "$body" | grep -o 'digest[^,]*\|Error[^<]\{0,160\}' | head -3; fi
}
hasnt() { if curl -s -b "$D/$2" "$B$3" | grep -q "have access"; then ok "$1"; else bad "$1" "no 403 page"; fi; }

for pair in "padmin admin@stagedesk.local" "owner eigenaar@feestband.local" "staff planning@feestband.local" "artist dj.sem@feestband.local" "cust sanne@klant.local"; do
  set -- $pair; c=$(signin $1 $2); [ "$c" = 200 ] || echo "sign-in $2 -> $c"
done

echo "Platform admin"
has "settings page" padmin /en/app/settings "Platform fee on bookings"
has "settings shows grace days" padmin /en/app/settings "Grace days"
has "agencies show plan + status" padmin /en/app/agencies "Fee deal"
has "agencies show trial status" padmin /en/app/agencies "Trial"
has "platform payments" padmin /en/app/platform-payments "Monthly subscription revenue"
has "plans page" padmin /en/app/plans "starter"

echo "Agency owner"
has "payments page" owner /en/app/payments "Online payments"
has "payments without Stripe explains" owner /en/app/payments "StageDesk hasn"
has "payments list" owner /en/app/payments "All payments"
has "billing page" owner /en/app/billing "Usage"
hasnt "owner blocked from settings" owner /en/app/settings "Platform fee on bookings"
hasnt "owner blocked from platform payments" owner /en/app/platform-payments "Monthly subscription revenue"

echo "Staff"
hasnt "staff blocked from payments" staff /en/app/payments "All payments"

echo "Artist"
has "earnings page" artist /en/app/earnings "Per booking"
has "earnings tiles" artist /en/app/earnings "Expected from upcoming gigs"

echo "Customer"
has "my payments" cust /en/app/my-payments "Payment history"
has "my payments return message" cust "/en/app/my-payments?paid=1" "Thanks! Your payment"
has "event page still renders" cust /en/app/event "Payments"

echo; echo "$pass passed, $fail failed"
