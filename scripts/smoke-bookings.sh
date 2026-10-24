#!/usr/bin/env bash
# Bookings, artists, customers and PDFs smoke test (phase 3). Needs services, `pnpm db:seed` and `pnpm dev`.
# Run: bash scripts/smoke-bookings.sh
B=http://localhost:3000; PW=StageDesk-demo-2026; D=$(mktemp -d)
H=(-H "Content-Type: application/json" -H "Origin: $B")
SQL() { "/c/Program Files/Docker/Docker/resources/bin/docker.exe" exec stagedesk-dev-mysql-1 mysql -N -ustagedesk -pstagedesk stagedesk -e "$1" 2>/dev/null; }
signin() { curl -s -c "$D/$1" "${H[@]}" -d "{\"email\":\"$2\",\"password\":\"$PW\"}" -o /dev/null -w '%{http_code}' $B/api/auth/sign-in/email; }
has() { # name, cookie, path, pattern
  if curl -s -b "$D/$2" "$B$3" | grep -q "$4"; then echo "  PASS  $1"; else echo "  FAIL  $1"; fi; }
hasnt() { if curl -s -b "$D/$2" "$B$3" | grep -q "$4"; then echo "  FAIL  $1"; else echo "  PASS  $1"; fi; }
pdf() { # name, cookie-or-empty, path, expect(pdf|404)
  local h; h=$(curl -s ${2:+-b "$D/$2"} "$B$3" | head -c 4)
  if [ "$4" = pdf ] && [ "$h" = "%PDF" ]; then echo "  PASS  $1"; elif [ "$4" = 404 ] && [ "$h" != "%PDF" ]; then echo "  PASS  $1"; else echo "  FAIL  $1 (got '$h')"; fi; }

for i in $(seq 1 40); do grep -q "Ready" /d/dev/stagedesk/.dev-web.log 2>/dev/null && break; sleep 2; done
echo "sign in: owner $(signin owner eigenaar@feestband.local) artist $(signin artist dj.sem@feestband.local) customer $(signin cust sanne@klant.local) rot $(signin rot eigenaar@rotterdamdj.local)"

echo "Agency"
has "artists list shows own artists" owner /app/artists "Lotte Sax"
has "artists list shows shared artist" owner /app/artists "Van Rotterdam DJ Collectief"
SEM=$(SQL "select id from artists where stageName='DJ Sem'")
has "artist detail shows upcoming gig" owner "/app/artists/$SEM" "Bruiloft"
hasnt "other agency can't open DJ Sem" rot "/app/artists/$SEM" "Openingsdans"
has "services list" owner /app/services "Ceremoniegeluid"
has "quotes overview" owner /app/quotes "Femke Visser"
has "calendar month" owner "/app/calendar?month=2027-06" "Sanne de Vries"
has "reviews list shows approved review" owner /app/reviews "Goedgekeurd"

echo "Artist"
has "gigs list" artist /app/gigs "Landgoed Zonheuvel\|Doorn"
SANNE=$(SQL "select trackingCode from bookings where status='confirmed' limit 1")
has "gig brief shows do's" artist "/app/gigs/$SANNE" "Openingsdans"
has "availability calendar" artist /app/availability "Beschikbaarheid"
has "artist blocked from bookings" artist /app/bookings "Je hebt geen toegang"

echo "Customer"
has "event page shows status" cust /app/event "Alles is bevestigd"
has "event page shows artist" cust /app/event "DJ Sem"
has "customer blocked from bookings" cust /app/bookings "Je hebt geen toegang"

echo "Public quote"
TOKEN=$(SQL "select q.token from quotes q join bookings b on b.id=q.bookingId where b.status='quoted' and q.status='sent' limit 1")
has "quote link opens without login" none "/q/$TOKEN" "Offerte accepteren"
has "unknown token" none "/q/not-a-real-token" "bestaat niet"

echo "PDFs"
QID=$(SQL "select q.id from quotes q join bookings b on b.id=q.bookingId where b.trackingCode='$SANNE'")
INV=$(SQL "select id from invoices limit 1")
pdf "agency downloads quote PDF" owner "/api/pdf/quote/$QID?lang=nl" pdf
pdf "customer downloads own quote PDF" cust "/api/pdf/quote/$QID?lang=en" pdf
pdf "other agency can't download quote" rot "/api/pdf/quote/$QID" 404
pdf "anonymous can't download quote" "" "/api/pdf/quote/$QID" 404
pdf "quote PDF with link token" "" "/api/pdf/quote/$(SQL "select id from quotes where token='$TOKEN'")?token=$TOKEN" pdf
pdf "agency downloads invoice" owner "/api/pdf/invoice/$INV" pdf
pdf "artist can't download invoice" artist "/api/pdf/invoice/$INV" 404

grep -iE "⨯|\"level\":\"ERROR\"" /d/dev/stagedesk/apps/web/.next/dev/logs/next-development.log | cut -c1-300 | head -5
rm -rf "$D"
