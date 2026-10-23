#!/usr/bin/env bash
# Accounts and agencies smoke test (phase 2). Needs `pnpm services:up`, `pnpm db:seed` and `pnpm dev`.
# Clears the Mailpit inbox. Run: bash scripts/smoke-accounts.sh
# Docker Desktop on Windows doesn't always put its CLI on the Git Bash PATH.
command -v docker >/dev/null || PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin"
B=http://localhost:3000
PW=StageDesk-demo-2026
D=$(mktemp -d)
H=(-H "Content-Type: application/json" -H "Origin: $B")
pass=0; fail=0
ok()   { echo "  PASS  $1"; pass=$((pass+1)); }
bad()  { echo "  FAIL  $1  ($2)"; fail=$((fail+1)); }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "expected $3, got $2"; fi; }
signin() { curl -s -c "$D/$1" "${H[@]}" -d "{\"email\":\"$2\",\"password\":\"$PW\"}" -o /dev/null -w '%{http_code}' $B/api/auth/sign-in/email; }
page()  { curl -s -b "$D/$1" "$B$2"; }
code()  { curl -s -b "$D/$1" -o /dev/null -w '%{http_code}' "$B$2"; }
api()   { curl -s -b "$D/$1" -c "$D/$1" "${H[@]}" -d "$3" -o "$D/out" -w '%{http_code}' "$B/api/auth$2"; }
orgid() { docker exec stagedesk-dev-mysql-1 mysql -N -ustagedesk -pstagedesk stagedesk -e "select id from organizations where slug='$1'" 2>/dev/null; }

FEEST=$(orgid feestband-utrecht); ROT=$(orgid rotterdam-dj-collectief)
RUN=$(date +%s)
NEWART="artiest.$RUN@test.local"; NEWSTAFF="staf.$RUN@test.local"
curl -s -X DELETE http://localhost:8025/api/v1/messages >/dev/null

echo "Sign-in"
check "owner signs in" "$(signin owner eigenaar@feestband.local)" 200
check "admin signs in" "$(signin admin beheer@feestband.local)" 200
check "artist signs in" "$(signin artist dj.sem@feestband.local)" 200
check "staff signs in" "$(signin staff planning@feestband.local)" 200
check "other agency owner signs in" "$(signin rot eigenaar@rotterdamdj.local)" 200
check "platform admin signs in" "$(signin padmin admin@stagedesk.local)" 200

echo "Pages by role"
check "owner opens team" "$(code owner /app/team)" 200
check "owner opens agency settings" "$(code owner /app/agency-settings)" 200
page owner /app/customers | grep -q "Sanne de Vries" && ok "owner sees own customer" || bad "owner sees own customer" "missing"
page owner /app/customers | grep -q "Bram Visser" && bad "owner can't see other agency's customer" "Bram visible" || ok "owner can't see other agency's customer"
page rot /app/customers | grep -q "Bram Visser" && ok "Rotterdam sees own customer" || bad "Rotterdam sees own customer" "missing"
page rot /app/customers | grep -q "Sanne de Vries" && bad "Rotterdam can't see Feestband customer" "Sanne visible" || ok "Rotterdam can't see Feestband customer"
page artist /app/team | grep -q "Je hebt geen toegang" && ok "artist gets 403 on team" || bad "artist gets 403 on team" "no 403 page"
page staff /app/agency-settings | grep -q "Je hebt geen toegang" && ok "staff gets 403 on agency settings" || bad "staff 403 on settings" "no 403 page"
check "staff opens customers" "$(code staff /app/customers)" 200
page owner /app/agencies | grep -q "Je hebt geen toegang" && ok "agency owner gets 403 on platform agencies" || bad "owner 403 on agencies" "no 403 page"
page padmin /app/agencies | grep -q "Rotterdam DJ Collectief" && ok "platform admin lists all agencies" || bad "admin lists agencies" "missing"

echo "Invitations"
check "owner invites an artist" "$(api owner /organization/invite-member "{\"email\":\"$NEWART\",\"role\":\"artist\",\"organizationId\":\"$FEEST\"}")" 200
check "admin invites staff" "$(api admin /organization/invite-member "{\"email\":\"$NEWSTAFF\",\"role\":\"agency_staff\",\"organizationId\":\"$FEEST\"}")" 200
check "inviting a customer is refused" "$(api owner /organization/invite-member "{\"email\":\"x.$RUN@test.local\",\"role\":\"customer\",\"organizationId\":\"$FEEST\"}")" 400
c=$(api admin /organization/invite-member "{\"email\":\"y.$RUN@test.local\",\"role\":\"agency_owner\",\"organizationId\":\"$FEEST\"}"); [ "$c" != 200 ] && ok "admin can't invite an owner ($c)" || bad "admin can't invite an owner" "$c"
c=$(api artist /organization/invite-member "{\"email\":\"z.$RUN@test.local\",\"role\":\"artist\",\"organizationId\":\"$FEEST\"}"); [ "$c" != 200 ] && ok "artist can't invite ($c)" || bad "artist can't invite" "$c"
c=$(api rot /organization/invite-member "{\"email\":\"w.$RUN@test.local\",\"role\":\"artist\",\"organizationId\":\"$FEEST\"}"); [ "$c" != 200 ] && ok "other agency can't invite into Feestband ($c)" || bad "cross-agency invite" "$c"
sleep 2
n=$(curl -s "http://localhost:8025/api/v1/search?query=to:$NEWART" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).messages_count))")
check "invitation email delivered to Mailpit" "$n" 1

echo "Invited artist joins"
check "invited artist signs up" "$(curl -s -c "$D/new" "${H[@]}" -d "{\"name\":\"Nieuwe Artiest\",\"email\":\"$NEWART\",\"password\":\"$PW\",\"callbackURL\":\"/app\"}" -o /dev/null -w '%{http_code}' $B/api/auth/sign-up/email)" 200
sleep 2
vid=$(curl -s "http://localhost:8025/api/v1/search?query=to:$NEWART%20subject:Bevestig" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).messages[0]?.ID??''))")
link=$(curl -s "http://localhost:8025/api/v1/message/$vid" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const m=JSON.parse(s).Text.match(/http\S*verify-email\S*/);console.log(m?m[0]:'')})")
[ -n "$link" ] && ok "verification email has a link" || bad "verification email" "no link"
check "verification link signs the user in" "$(curl -s -c "$D/new" -b "$D/new" -o /dev/null -w '%{http_code}' "$link")" 302
inv=$(docker exec stagedesk-dev-mysql-1 mysql -N -ustagedesk -pstagedesk stagedesk -e "select id from invitations where email='$NEWART' and status='pending'" 2>/dev/null)
check "invitation page opens" "$(code new /invite/$inv)" 200
check "artist accepts invitation" "$(api new /organization/accept-invitation "{\"invitationId\":\"$inv\"}")" 200
# A brand-new account is asked to accept the Terms first; that redirect is streamed inside the shell.
np=$(page new /app); { echo "$np" | grep -q "Feestband Utrecht" || echo "$np" | grep -q "accept-terms"; } && ok "new artist lands in Feestband (after the Terms)" || bad "new artist dashboard" "agency missing"
page new /app/team | grep -q "Je hebt geen toegang" && ok "new artist can't open team page" || bad "new artist team 403" "no 403"

echo "Cross-agency writes"
mem=$(docker exec stagedesk-dev-mysql-1 mysql -N -ustagedesk -pstagedesk stagedesk -e "select m.id from members m join users u on u.id=m.userId where u.email='planning@feestband.local'" 2>/dev/null)
c=$(api rot /organization/remove-member "{\"memberIdOrEmail\":\"$mem\",\"organizationId\":\"$FEEST\"}"); [ "$c" != 200 ] && ok "other agency can't remove Feestband staff ($c)" || bad "cross-agency remove" "$c"
c=$(api rot /organization/update "{\"organizationId\":\"$FEEST\",\"data\":{\"name\":\"Hacked\"}}"); [ "$c" != 200 ] && ok "other agency can't rename Feestband ($c)" || bad "cross-agency update" "$c"
c=$(api staff /organization/update "{\"organizationId\":\"$FEEST\",\"data\":{\"name\":\"Hacked\"}}"); [ "$c" != 200 ] && ok "staff can't rename own agency ($c)" || bad "staff update org" "$c"
c=$(api admin /organization/update-member-role "{\"memberId\":\"$mem\",\"role\":\"customer\",\"organizationId\":\"$FEEST\"}"); [ "$c" != 200 ] && ok "admin can't turn staff into customer ($c)" || bad "role to customer" "$c"
c=$(curl -s -b "$D/owner" "${H[@]}" -d "{\"platformRole\":\"platform_admin\"}" -o /dev/null -w '%{http_code}' $B/api/auth/update-user)
pr=$(docker exec stagedesk-dev-mysql-1 mysql -N -ustagedesk -pstagedesk stagedesk -e "select coalesce(platformRole,'none') from users where email='eigenaar@feestband.local'" 2>/dev/null)
check "owner can't make themselves platform admin (http $c)" "$pr" none

echo
echo "$pass passed, $fail failed"
rm -rf "$D"
[ $fail -eq 0 ]
