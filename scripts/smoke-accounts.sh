#!/usr/bin/env bash
# Accounts and agencies. Needs `pnpm services:up`, `pnpm db:seed` and `pnpm dev:e2e`.
# Removes the accounts and invitations it made. Run: bash scripts/smoke-accounts.sh
. "$(dirname "$0")/smoke-lib.sh"
api() { curl -s -m 60 -b "$D/$1" -c "$D/$1" "${H[@]}" -d "$3" -o "$D/out" -w '%{http_code}' "$B/api/auth$2"; }
orgid() { sql "select id from organizations where slug='$1'"; }

FEEST=$(orgid feestband-utrecht); ROT=$(orgid rotterdam-dj-collectief)
RUN=$(date +%s)
NEWART="smoke-artiest.$RUN@test.local"; NEWSTAFF="smoke-staf.$RUN@test.local"
# Pending invitations hold staff seats, so a run mustn't leave them behind.
cleanup() {
  sql "delete from invitations where email like 'smoke-%.$RUN@test.local' or email like '%.$RUN@test.local'"
  sql "delete from users where email like 'smoke-%.$RUN@test.local'"
}
trap cleanup EXIT

echo "Sign-in"
check "owner signs in" "$(signin owner eigenaar@feestband.local)" 200
check "admin signs in" "$(signin admin beheer@feestband.local)" 200
check "artist signs in" "$(signin artist dj.sem@feestband.local)" 200
check "staff signs in" "$(signin staff planning@feestband.local)" 200
check "other agency owner signs in" "$(signin rot eigenaar@rotterdamdj.local)" 200
check "platform admin signs in" "$(signin_admin padmin)" 200
c=$(curl -s -m 60 "${H[@]}" -d "{\"email\":\"eigenaar@feestband.local\",\"password\":\"wrong-password\"}" -o /dev/null -w '%{http_code}' "$B/api/auth/sign-in/email"); [ "$c" = 401 ] && ok "wrong password is refused" || bad "wrong password is refused" "$c"

echo "Pages by role"
has "owner opens team" owner /app/team "$(sql "select name from users where email='planning@feestband.local'")"
has "owner opens agency settings" owner /app/agency-settings "Feestband Utrecht"
# Searched by name: the demo agencies have more customers than fit on a page.
has "owner sees own customer" owner "/app/customers?q=Sanne" "Sanne de Vries"
withheld "owner can't see other agency's customer" owner "/app/customers?q=Bram" "Bram Visser"
has "Rotterdam sees own customer" rot "/app/customers?q=Bram" "Bram Visser"
withheld "Rotterdam can't see Feestband customer" rot "/app/customers?q=Sanne" "Sanne de Vries"
refused "artist refused on team" artist /app/team "planning@feestband.local"
refused "staff refused on agency settings" staff /app/agency-settings
has "staff opens customers" staff "/app/customers?q=Sanne" "Sanne de Vries"
refused "agency owner refused on platform agencies" owner /app/agencies "Rotterdam DJ Collectief"
has "platform admin lists all agencies" padmin /app/agencies "Rotterdam DJ Collectief"
code_anon=$(code "" /app/team); [ "$code_anon" = 307 ] && ok "anonymous is sent to sign-in" || bad "anonymous is sent to sign-in" "$code_anon"

echo "Invitations"
check "owner invites an artist" "$(api owner /organization/invite-member "{\"email\":\"$NEWART\",\"role\":\"artist\",\"organizationId\":\"$FEEST\"}")" 200
check "admin invites staff" "$(api admin /organization/invite-member "{\"email\":\"$NEWSTAFF\",\"role\":\"agency_staff\",\"organizationId\":\"$FEEST\"}")" 200
check "inviting a customer is refused" "$(api owner /organization/invite-member "{\"email\":\"x.$RUN@test.local\",\"role\":\"customer\",\"organizationId\":\"$FEEST\"}")" 400
c=$(api admin /organization/invite-member "{\"email\":\"y.$RUN@test.local\",\"role\":\"agency_owner\",\"organizationId\":\"$FEEST\"}"); [ "$c" != 200 ] && ok "admin can't invite an owner ($c)" || bad "admin can't invite an owner" "$c"
c=$(api artist /organization/invite-member "{\"email\":\"z.$RUN@test.local\",\"role\":\"artist\",\"organizationId\":\"$FEEST\"}"); [ "$c" != 200 ] && ok "artist can't invite ($c)" || bad "artist can't invite" "$c"
c=$(api rot /organization/invite-member "{\"email\":\"w.$RUN@test.local\",\"role\":\"artist\",\"organizationId\":\"$FEEST\"}"); [ "$c" != 200 ] && ok "other agency can't invite into Feestband ($c)" || bad "cross-agency invite" "$c"
check "refused invitations left nothing" "$(sql "select count(*) from invitations where email like '%.$RUN@test.local' and email not like 'smoke-%'")" 0
for _ in 1 2 3 4 5 6 7 8 9 10; do n=$(mail_count "$NEWART"); [ "$n" -ge 1 ] && break; sleep 1; done
check "invitation email delivered to Mailpit" "$n" 1

echo "Invited artist joins"
check "invited artist signs up" "$(curl -s -m 60 -c "$D/new" "${H[@]}" -d "{\"name\":\"Nieuwe Artiest\",\"email\":\"$NEWART\",\"password\":\"$PW\",\"callbackURL\":\"/app\"}" -o /dev/null -w '%{http_code}' "$B/api/auth/sign-up/email")" 200
for _ in 1 2 3 4 5 6 7 8 9 10; do link=$(mail_link "$NEWART" 'http\S*verify-email\S*'); [ -n "$link" ] && break; sleep 1; done
[ -n "$link" ] && ok "verification email has a link" || bad "verification email" "no link"
check "verification link signs the user in" "$(curl -s -m 60 -c "$D/new" -b "$D/new" -o /dev/null -w '%{http_code}' "$link")" 302
accept_terms "$NEWART"
inv=$(sql "select id from invitations where email='$NEWART' and status='pending'")
check "invitation page opens" "$(code new "/invite/$inv")" 200
check "artist accepts invitation" "$(api new /organization/accept-invitation "{\"invitationId\":\"$inv\"}")" 200
check "they became an artist member" "$(sql "select m.role from members m join users u on u.id=m.userId where u.email='$NEWART' and m.organizationId='$FEEST'")" artist
has "new artist lands in Feestband" new /app "Feestband Utrecht"
refused "new artist refused on team" new /app/team

echo "Cross-agency writes"
mem=$(sql "select m.id from members m join users u on u.id=m.userId where u.email='planning@feestband.local'")
c=$(api rot /organization/remove-member "{\"memberIdOrEmail\":\"$mem\",\"organizationId\":\"$FEEST\"}"); [ "$c" != 200 ] && ok "other agency can't remove Feestband staff ($c)" || bad "cross-agency remove" "$c"
check "the staff member is still there" "$(sql "select count(*) from members where id='$mem'")" 1
c=$(api rot /organization/update "{\"organizationId\":\"$FEEST\",\"data\":{\"name\":\"Hacked\"}}"); [ "$c" != 200 ] && ok "other agency can't rename Feestband ($c)" || bad "cross-agency update" "$c"
c=$(api staff /organization/update "{\"organizationId\":\"$FEEST\",\"data\":{\"name\":\"Hacked\"}}"); [ "$c" != 200 ] && ok "staff can't rename own agency ($c)" || bad "staff update org" "$c"
check "the agency's name didn't change" "$(sql "select name from organizations where id='$FEEST'")" "Feestband Utrecht"
c=$(api admin /organization/update-member-role "{\"memberId\":\"$mem\",\"role\":\"customer\",\"organizationId\":\"$FEEST\"}"); [ "$c" != 200 ] && ok "admin can't turn staff into customer ($c)" || bad "role to customer" "$c"
c=$(curl -s -m 60 -b "$D/owner" "${H[@]}" -d "{\"platformRole\":\"platform_admin\"}" -o /dev/null -w '%{http_code}' "$B/api/auth/update-user")
check "owner can't make themselves platform admin (http $c)" "$(sql "select coalesce(platformRole,'none') from users where email='eigenaar@feestband.local'")" none

finish
