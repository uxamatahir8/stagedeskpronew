#!/usr/bin/env bash
# Shared by the smoke scripts. Always local: the address and the database container are fixed
# on purpose, and these scripts write test data, so they must never point at staging.
#
# Why pages are read through `visible`: every page embeds the whole translation file in its
# <script> payload, so a plain grep for translated text matches on any page, including a
# refusal. Checks for text look only at the rendered HTML.
#
# Refusals have status 200 and arrive only in the React payload, not as HTML. Text can't identify
# them (see above), and neither can anything on forbidden.tsx: Next.js sends that component with
# every page, ready for use. What it sends only when forbidden() was really thrown is the digest
# below, checked against authorized and refused pages of each role. A value given to `refused`
# or `withheld` must be data from the database (never a translated text, and not something the
# page shows anyway, like the URL or the viewer's own name): it's searched in the whole response.
B=http://localhost:3000
MAILPIT=http://localhost:8025/api/v1
PW=StageDesk-demo-2026
D=$(mktemp -d)
H=(-H "Content-Type: application/json" -H "Origin: $B")
FORBIDDEN='NEXT_HTTP_ERROR_FALLBACK;403'
# A platform admin of its own, so the local demo admin's password doesn't matter. On a test
# domain, so `pnpm db:clean-test --yes` removes it.
SMOKE_ADMIN=smoke-admin@e2e-beheer.nl
pass=0; fail=0
command -v docker >/dev/null || PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin"

ok()    { echo "  PASS  $1"; pass=$((pass+1)); }
bad()   { echo "  FAIL  $1  ($2)"; fail=$((fail+1)); }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "expected $3, got $2"; fi; }
sql()   { docker exec stagedesk-dev-mysql-1 mysql -N -ustagedesk -pstagedesk stagedesk -e "$1" 2>/dev/null; }

finish() {
  rm -rf "$D"
  echo; echo "$pass passed, $fail failed"
  [ "$fail" -eq 0 ]
  exit $?
}

curl -s -m 60 -o /dev/null "$B/api/health" || { echo "Nothing answers on $B: start it with pnpm dev:e2e"; exit 2; }

# The rendered page: no scripts (the translation payload), entities turned back into text.
visible() {
  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(s.replace(/<script\b[\s\S]*?<\/script>/g,' ').replace(/&#x27;/g,\"'\").replace(/&quot;/g,'\"').replace(/&amp;/g,'&')))"
}
# Follows redirects, because a page can move (language, canonical address). Empty cookie: anonymous.
fetch_page() { curl -s -m 120 -L ${1:+-b "$D/$1"} "$B$2"; }
page() { fetch_page "$1" "$2" | visible; }
code() { curl -s -m 120 -o /dev/null -w '%{http_code}' ${1:+-b "$D/$1"} "$B$2"; }

# Accepting current legal pages is the one step a person does at first sign-in that isn't what's tested here.
accept_terms() {
  sql "insert ignore into legal_acceptances (id, userId, pageId, versionId) select uuid(), u.id, p.id, p.publishedVersionId from pages p join users u on u.email='$1' left join legal_acceptances l on l.userId=u.id and l.versionId=p.publishedVersionId where p.status='published' and p.acceptance in ('all','agencies') and p.publishedVersionId is not null and l.id is null" >/dev/null
}

# signin <cookie> <email>: prints the status. Sign-ins are limited to 10 a minute: waits that out once.
signin() {
  local c; c=$(curl -s -m 60 -c "$D/$1" "${H[@]}" -d "{\"email\":\"$2\",\"password\":\"$PW\"}" -o /dev/null -w '%{http_code}' "$B/api/auth/sign-in/email")
  if [ "$c" = 429 ]; then sleep 61; c=$(curl -s -m 60 -c "$D/$1" "${H[@]}" -d "{\"email\":\"$2\",\"password\":\"$PW\"}" -o /dev/null -w '%{http_code}' "$B/api/auth/sign-in/email"); fi
  [ "$c" = 200 ] && accept_terms "$2"
  echo "$c"
}
need_signin() { local c; c=$(signin "$1" "$2"); [ "$c" = 200 ] || bad "sign-in $2" "got $c"; }

# signin_admin <cookie>: the dedicated admin, made on first use.
signin_admin() {
  if [ -z "$(sql "select id from users where email='$SMOKE_ADMIN'")" ]; then
    curl -s -m 60 "${H[@]}" -d "{\"name\":\"Smoke Admin\",\"email\":\"$SMOKE_ADMIN\",\"password\":\"$PW\"}" -o /dev/null "$B/api/auth/sign-up/email"
  fi
  sql "update users set emailVerified=1, platformRole='platform_admin' where email='$SMOKE_ADMIN'"
  signin "$1" "$SMOKE_ADMIN"
}

# has <name> <cookie> <path> <text>: the rendered page shows the text and isn't a refusal.
has() {
  local raw; raw=$(fetch_page "$2" "$3")
  if echo "$raw" | grep -q "$FORBIDDEN"; then bad "$1" "refused"; return; fi
  if echo "$raw" | visible | grep -q "$4"; then ok "$1"; else bad "$1" "missing: $4"; fi
}
# hasnt <name> <cookie> <path> <text>: the rendered page doesn't show the text (for lists scoped to one party).
hasnt() { if page "$2" "$3" | grep -q "$4"; then bad "$1" "shows: $4"; else ok "$1"; fi; }
# refused <name> <cookie> <path> [database value that must be absent]: shows the refusal page.
refused() {
  local raw; raw=$(fetch_page "$2" "$3")
  if ! echo "$raw" | grep -q "$FORBIDDEN"; then bad "$1" "no refusal page"; return; fi
  if [ -n "$4" ] && echo "$raw" | grep -q "$4"; then bad "$1" "refused, yet the response holds: $4"; return; fi
  ok "$1"
}
# withheld <name> <cookie> <path> <database value>: refused or not found; it's nowhere in the response.
withheld() {
  if fetch_page "$2" "$3" | grep -q "$4"; then bad "$1" "the response holds: $4"; else ok "$1"; fi
}
# Raw body, for what isn't rendered HTML: JSON-LD, sitemaps, headers.
raw_has() { if curl -s -m 120 -L "$B$2" | grep -q "$3"; then ok "$1"; else bad "$1" "missing: $3"; fi; }

# mail_count <address>, and the text of a message matching a pattern.
mail_count() { curl -s "$MAILPIT/search?query=to:$1" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).messages_count??0))"; }
# mail_link <address> <regex>: the first match of the regex across that address's messages.
mail_link() {
  ADDRESS=$1 PATTERN=$2 API=$MAILPIT node -e "(async()=>{const q=await (await fetch(process.env.API+'/search?query=to:'+process.env.ADDRESS)).json();for(const m of q.messages??[]){const t=(await (await fetch(process.env.API+'/message/'+m.ID)).json()).Text;const f=t.match(new RegExp(process.env.PATTERN));if(f){console.log(f[0]);return}}})()"
}
