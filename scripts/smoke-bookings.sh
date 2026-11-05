#!/usr/bin/env bash
# Bookings, artists, customers, artist gig access and PDFs. Read-only. Needs services, `pnpm db:seed` and `pnpm dev:e2e`.
# Run: bash scripts/smoke-bookings.sh
. "$(dirname "$0")/smoke-lib.sh"
# pdf <name> <cookie or empty> <path> <pdf|refused>: real PDF bytes, or anything but.
pdf() {
  local h; h=$(curl -s -m 120 ${2:+-b "$D/$2"} "$B$3" | head -c 4)
  if [ "$4" = pdf ] && [ "$h" = "%PDF" ]; then ok "$1"; elif [ "$4" = refused ] && [ "$h" != "%PDF" ]; then ok "$1"; else bad "$1" "got '$h'"; fi
}

need_signin owner eigenaar@feestband.local; need_signin artist dj.sem@feestband.local; need_signin cust sanne@klant.local
need_signin rot eigenaar@rotterdamdj.local; need_signin yara dj.yara@rotterdamdj.local; need_signin bram bram@klant.local

SEM=$(sql "select id from artists where stageName='DJ Sem'")
# Sanne's confirmed booking with DJ Sem, from the seed; other confirmed bookings may be test leftovers.
GIG=$(sql "select b.trackingCode from bookings b join users u on u.id=b.customerId join booking_assignments ba on ba.bookingId=b.id and ba.status='accepted' where u.email='sanne@klant.local' and ba.artistId='$SEM' and b.status='confirmed' order by b.eventDate limit 1")
[ -n "$GIG" ] && ok "seed has a confirmed gig for DJ Sem" || bad "seed has a confirmed gig for DJ Sem" "run pnpm db:seed"

echo "Agency"
has "artists list finds own artist" owner "/app/artists?q=Lotte" "Lotte Sax"
withheld "another agency can't find that artist" rot "/app/artists?q=Lotte" "Lotte Sax"
has "artists list shows shared artist" owner /nl/app/artists "Van Rotterdam DJ Collectief"
has "artist detail shows upcoming gig" owner "/nl/app/artists/$SEM" "Bruiloft"
withheld "other agency can't open DJ Sem" rot "/app/artists/$SEM" "$GIG"
has "services list" owner /app/services "Ceremoniegeluid"
has "quotes overview" owner "/app/quotes?q=Femke" "Femke Visser"
has "calendar month" owner "/app/calendar?month=2027-06" "Sanne de Vries"
has "reviews list shows approved review" owner /nl/app/reviews "Goedgekeurd"
has "desk opens its booking" owner "/app/bookings/$GIG" "$GIG"
withheld "other agency can't open that booking" rot "/app/bookings/$GIG" "Sanne de Vries"

echo "Artist"
has "gigs list shows their gig" artist /app/gigs "$GIG"
has "gig brief shows do's" artist "/app/gigs/$GIG" "Openingsdans"
withheld "another agency's artist can't open that gig" yara "/app/gigs/$GIG" "Sanne de Vries"
withheld "another agency's artist doesn't list it" yara /app/gigs "$GIG"
withheld "another customer can't open a gig" bram "/app/gigs/$GIG" "Sanne de Vries"
has "availability calendar" artist /nl/app/availability "Beschikbaarheid"
refused "artist refused on bookings" artist /app/bookings "$GIG"
has "their messages page opens" artist /app/messages "Your conversations"

echo "Customer"
has "event page shows status" cust /nl/app/event "Alles is bevestigd"
has "event page shows artist" cust /app/event "DJ Sem"
withheld "another customer doesn't see it" bram "/app/event?booking=$GIG" "Sanne de Vries"
refused "customer refused on bookings" cust /app/bookings "Femke Visser"

echo "Public quote"
TOKEN=$(sql "select q.token from quotes q join bookings b on b.id=q.bookingId join users u on u.id=b.customerId where b.status='quoted' and q.status='sent' and u.email like '%.local' limit 1")
if [ -n "$TOKEN" ]; then
  has "quote link opens without login" "" "/nl/q/$TOKEN" "Offerte accepteren"
else
  bad "quote link opens without login" "no open quote in the seed: run pnpm db:seed"
fi
has "unknown token" "" "/nl/q/not-a-real-token" "bestaat niet"

echo "PDFs"
QID=$(sql "select q.id from quotes q join bookings b on b.id=q.bookingId where b.trackingCode='$GIG' limit 1")
FEEST=$(sql "select id from organizations where slug='feestband-utrecht'")
INV=$(sql "select id from invoices where organizationId='$FEEST' limit 1")
pdf "agency downloads quote PDF" owner "/api/pdf/quote/$QID?lang=nl" pdf
pdf "customer downloads own quote PDF" cust "/api/pdf/quote/$QID?lang=en" pdf
pdf "other agency can't download quote" rot "/api/pdf/quote/$QID" refused
pdf "another customer can't download quote" bram "/api/pdf/quote/$QID" refused
pdf "anonymous can't download quote" "" "/api/pdf/quote/$QID" refused
[ -n "$TOKEN" ] && pdf "quote PDF with link token" "" "/api/pdf/quote/$(sql "select id from quotes where token='$TOKEN'")?token=$TOKEN" pdf
pdf "agency downloads invoice" owner "/api/pdf/invoice/$INV" pdf
pdf "artist can't download invoice" artist "/api/pdf/invoice/$INV" refused

finish
