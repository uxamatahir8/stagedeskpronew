#!/usr/bin/env bash
set -Eeuo pipefail

password="${MAILHOG_WEB_PASSWORD:-}"
if [[ -z "$password" ]]; then
  echo "MAILHOG_WEB_PASSWORD is required." >&2
  exit 2
fi

domain="smtp.mailhog.scholarlynest.com"
config_file=""
for directory in /etc/nginx/sites-enabled /etc/nginx/sites-available /etc/nginx/conf.d; do
  [[ -d "$directory" ]] || continue
  config_file="$(grep -RIl --include='*.conf' "$domain" "$directory" 2>/dev/null | head -n 1 || true)"
  [[ -n "$config_file" ]] && break
done

if [[ -z "$config_file" ]]; then
  echo "Could not locate the Nginx configuration for $domain." >&2
  exit 1
fi

auth_file="$(awk '$1 == "auth_basic_user_file" { value=$2; sub(/;$/, "", value); print value; exit }' "$config_file")"
if [[ -z "$auth_file" ]]; then
  echo "No auth_basic_user_file directive was found in $config_file." >&2
  exit 1
fi
if [[ "$auth_file" != /* ]]; then
  auth_file="/etc/nginx/$auth_file"
fi

read_auth_file() {
  if [[ -r "$auth_file" ]]; then
    cat "$auth_file"
  else
    sudo -n cat "$auth_file"
  fi
}

current="$(read_auth_file)"
username="$(printf '%s\n' "$current" | awk -F: 'NF >= 2 { print $1; exit }')"
if [[ -z "$username" ]]; then
  echo "The MailHog authentication file has no user." >&2
  exit 1
fi

hash="$(openssl passwd -apr1 "$password")"
replacement="$(printf '%s\n' "$current" | awk -F: -v user="$username" -v hash="$hash" 'BEGIN { OFS=":" } $1 == user && !done { print user, hash; done=1; next } { print }')"
temporary="$(mktemp)"
trap 'rm -f "$temporary"' EXIT
printf '%s\n' "$replacement" > "$temporary"

if [[ -w "$auth_file" ]]; then
  cat "$temporary" > "$auth_file"
else
  sudo -n cp "$temporary" "$auth_file"
fi

unauthenticated_status="$(curl -sS -o /dev/null -w '%{http_code}' "https://$domain/")"
authenticated_status="$(curl -sS -u "$username:$password" -o /dev/null -w '%{http_code}' "https://$domain/")"
if [[ "$unauthenticated_status" != "401" || "$authenticated_status" != "200" ]]; then
  echo "MailHog authentication verification failed (anonymous=$unauthenticated_status, authenticated=$authenticated_status)." >&2
  exit 1
fi

echo "Updated and verified the MailHog web password for user $username."
