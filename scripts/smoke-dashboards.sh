#!/usr/bin/env bash
# Dashboards, messaging, support, admin tools and the email queue.
# Needs `pnpm services:up`, `pnpm db:seed`, the web app and the worker (`pnpm dev:e2e`).
# Run: bash scripts/smoke-dashboards.sh
. "$(dirname "$0")/smoke-lib.sh"

c=$(signin_admin padmin); [ "$c" = 200 ] || bad "sign-in admin" "got $c"
need_signin owner eigenaar@feestband.local; need_signin staff planning@feestband.local
need_signin artist dj.sem@feestband.local; need_signin cust sanne@klant.local

echo "Dashboards"
has "admin home has revenue and charts" padmin /app "Monthly recurring revenue"
has "admin home charts online payments" padmin /app "Online payments"
has "agency home charts booked vs collected" owner /app "Booked and collected"
has "agency home shows artist workload" owner /app "Artist workload"
has "agency home shows plan usage" owner /app "Plan usage"
hasnt "staff does not see revenue" staff /app "Booked and collected"
has "artist home lists next gigs" artist /app "Next gigs"
has "customer home counts down" cust /app "Days to go"

echo "Messages and support"
has "messages page for the desk" owner /app/messages "Conversations with customers and artists"
has "messages page for the customer" cust /app/messages "Your conversations"
has "support page" cust /app/support "Ask a question"
has "support queue for admins" padmin /app/support "Waiting for us"

echo "Admin tools"
has "users list filtered to admins" padmin "/app/users?filter=platform_admin" "$SMOKE_ADMIN"
has "users search" padmin "/app/users?q=sanne" "sanne@klant.local"
has "email previews" padmin "/app/emails?kind=loginCode&lang=en" "Sign-in code"
has "notifications page" owner /app/notifications "Notifications"
refused "owner refused on email previews" owner /app/emails
has "audit log" padmin /app/audit "Audit log"
refused "owner refused on users" owner /app/users "sanne@klant.local"
refused "owner refused on audit log" owner /app/audit

echo "CSV export"
csv=$(curl -s -m 60 -b "$D/owner" -D "$D/h" "$B/api/export/bookings")
grep -qi "content-type: text/csv" "$D/h" && echo "$csv" | head -1 | grep -q "code,status,event_type" && ok "owner exports bookings" || bad "owner exports bookings" "$(head -c 80 <<<"$csv")"
c=$(curl -s -m 60 -b "$D/staff" -o /dev/null -w '%{http_code}' "$B/api/export/payments"); [ "$c" = 403 ] && ok "staff can't export payments" || bad "staff can't export payments" "$c"
c=$(curl -s -m 60 -o /dev/null -w '%{http_code}' "$B/api/export/bookings"); [ "$c" = 403 ] && ok "export needs a session" || bad "export needs a session" "$c"

echo "Notifications"
first=$(curl -s -N -m 5 -b "$D/owner" "$B/api/notifications/stream" | head -c 2000)
echo "$first" | grep -q '^data: {"items"' && ok "stream sends a snapshot" || bad "stream sends a snapshot" "$(head -c 80 <<<"$first")"
c=$(curl -s -m 5 -o /dev/null -w '%{http_code}' "$B/api/notifications/stream"); [ "$c" = 401 ] && ok "stream needs a session" || bad "stream needs a session" "$c"

echo "Email queue"
before=$(mail_count sanne@klant.local)
otp=$(curl -s -m 60 "${H[@]}" -d '{"email":"sanne@klant.local","type":"sign-in"}' -o /dev/null -w "%{http_code}" "$B/api/auth/email-otp/send-verification-otp")
if [ "$otp" = 429 ]; then
  # Not a pass: the check didn't run. Named so it can't be mistaken for one.
  echo "  NOT RUN  sign-in code (rate limited: 3 per 5 minutes per IP)"
else
  for _ in 1 2 3 4 5 6 7 8 9 10; do n=$(mail_count sanne@klant.local); [ "$n" -gt "$before" ] && break; sleep 1; done
  [ "$n" -gt "$before" ] && ok "sign-in code arrives" || bad "sign-in code arrives" "$before -> $n"
fi

finish
