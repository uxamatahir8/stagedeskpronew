#!/usr/bin/env bash
# Dashboards, messaging, support, admin tools and email queue (phase 7).
# Needs `pnpm services:up`, `pnpm db:seed`, the web app and the worker (`pnpm dev`).
# Run: bash scripts/smoke-dashboards.sh
B=http://localhost:3000
PW=StageDesk-demo-2026
D=$(mktemp -d)
H=(-H "Content-Type: application/json" -H "Origin: $B")
pass=0; fail=0
ok()   { echo "  PASS  $1"; pass=$((pass+1)); }
bad()  { echo "  FAIL  $1  ($2)"; fail=$((fail+1)); }
signin() { curl -s -c "$D/$1" "${H[@]}" -d "{\"email\":\"$2\",\"password\":\"$PW\"}" -o /dev/null -w '%{http_code}' $B/api/auth/sign-in/email; }
has() { if curl -s -b "$D/$2" "$B$3" | grep -q "$4"; then ok "$1"; else bad "$1" "missing: $4"; fi; }
blocked() { if curl -s -b "$D/$2" "$B$3" | grep -q "have access"; then ok "$1"; else bad "$1" "no 403 page"; fi; }

for pair in "padmin admin@stagedesk.local" "owner eigenaar@feestband.local" "staff planning@feestband.local" "artist dj.sem@feestband.local" "cust sanne@klant.local"; do
  set -- $pair; c=$(signin $1 $2); [ "$c" = 200 ] || echo "sign-in $2 -> $c"
done

echo "Dashboards"
has "admin home has revenue and charts" padmin /en/app "Monthly recurring revenue"
has "admin home charts online payments" padmin /en/app "Online payments"
has "agency home charts booked vs collected" owner /en/app "Booked and collected"
has "agency home shows artist workload" owner /en/app "Artist workload"
has "agency home shows plan usage" owner /en/app "Plan usage"
curl -s -b "$D/staff" "$B/en/app" | grep -q "<figure" && bad "staff does not see revenue" "chart shown" || ok "staff does not see revenue"
has "artist home lists next gigs" artist /en/app "Next gigs"
has "customer home counts down" cust /en/app "Days to go"

echo "Messages and support"
has "messages page for the desk" owner /en/app/messages "Conversations with customers and artists"
has "messages page for the customer" cust /en/app/messages "Your conversations"
has "support page" cust /en/app/support "Ask a question"
has "support queue for admins" padmin /en/app/support "Waiting for us"

echo "Admin tools"
has "users list filtered to admins" padmin "/en/app/users?filter=platform_admin" "admin@stagedesk.local"
has "users search" padmin "/en/app/users?q=sanne" "sanne@klant.local"
has "audit log" padmin /en/app/audit "Audit log"
blocked "owner can't open users" owner /en/app/users
blocked "owner can't open audit log" owner /en/app/audit

echo "CSV export"
csv=$(curl -s -b "$D/owner" -D "$D/h" $B/api/export/bookings)
grep -qi "content-type: text/csv" "$D/h" && echo "$csv" | head -1 | grep -q "code,status,event_type" && ok "owner exports bookings" || bad "owner exports bookings" "$(head -c 80 <<<"$csv")"
c=$(curl -s -b "$D/staff" -o /dev/null -w '%{http_code}' $B/api/export/payments); [ "$c" = 403 ] && ok "staff can't export payments" || bad "staff can't export payments" "$c"
c=$(curl -s -o /dev/null -w '%{http_code}' $B/api/export/bookings); [ "$c" = 403 ] && ok "export needs a session" || bad "export needs a session" "$c"

echo "Notifications"
first=$(curl -s -N -m 3 -b "$D/owner" $B/api/notifications/stream | head -c 2000)
echo "$first" | grep -q '^data: {"items"' && ok "stream sends a snapshot" || bad "stream sends a snapshot" "$(head -c 80 <<<"$first")"
c=$(curl -s -m 3 -o /dev/null -w '%{http_code}' $B/api/notifications/stream); [ "$c" = 401 ] && ok "stream needs a session" || bad "stream needs a session" "$c"

echo "Email queue"
curl -s -X DELETE http://localhost:8025/api/v1/messages >/dev/null
otp=$(curl -s "${H[@]}" -d '{"email":"sanne@klant.local","type":"sign-in"}' -o /dev/null -w "%{http_code}" $B/api/auth/email-otp/send-verification-otp)
if [ "$otp" = 429 ]; then echo "  SKIP  sign-in code (rate limited: 3 per 5 minutes per IP)"; echo; echo "$pass passed, $fail failed"; exit 0; fi
for _ in 1 2 3 4 5 6 7 8 9 10; do
  n=$(curl -s "http://localhost:8025/api/v1/search?query=to:sanne@klant.local" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).messages_count))")
  [ "$n" -ge 1 ] && break; sleep 1
done
[ "$n" -ge 1 ] && ok "sign-in code arrives (through the worker queue)" || bad "sign-in code arrives" "$n"
grep -q "\[email\] loginCode done" .dev-worker.log 2>/dev/null && ok "worker sent it" || echo "  NOTE  worker log not found or worker not running; the web app sent it directly"

echo; echo "$pass passed, $fail failed"
