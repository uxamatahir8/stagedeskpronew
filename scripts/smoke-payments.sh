#!/usr/bin/env bash
# Payments and billing screens by role. Read-only. Needs `pnpm services:up`, `pnpm db:seed` and `pnpm dev:e2e`.
# Run: bash scripts/smoke-payments.sh
. "$(dirname "$0")/smoke-lib.sh"

c=$(signin_admin padmin); [ "$c" = 200 ] || bad "sign-in admin" "got $c"
need_signin owner eigenaar@feestband.local; need_signin staff planning@feestband.local
need_signin artist dj.sem@feestband.local; need_signin cust sanne@klant.local

echo "Platform admin"
has "settings page" padmin /app/settings "Platform fee on bookings"
has "settings shows grace days" padmin /app/settings "Grace days"
has "agencies show plan + status" padmin /app/agencies "Fee deal"
has "agencies show trial status" padmin /app/agencies "Trial"
has "platform payments" padmin /app/platform-payments "Monthly subscription revenue"
has "plans page" padmin /app/plans "starter"

echo "Agency owner"
has "payments page" owner /app/payments "Online payments"
has "payments list" owner /app/payments "All payments"
has "billing page" owner /app/billing "Usage"
refused "owner refused on settings" owner /app/settings
refused "owner refused on platform payments" owner /app/platform-payments

echo "Staff"
refused "staff refused on payments" staff /app/payments

echo "Artist"
has "earnings page" artist /app/earnings "Per booking"
has "earnings tiles" artist /app/earnings "Expected from upcoming gigs"
refused "artist refused on agency payments" artist /app/payments

echo "Customer"
has "my payments" cust /app/my-payments "Payment history"
has "my payments return message" cust "/app/my-payments?paid=1" "Thanks! Your payment"
has "event page still renders" cust /app/event "Payments"
refused "customer refused on agency payments" cust /app/payments

finish
