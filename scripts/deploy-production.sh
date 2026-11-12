#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_SHA="${1:-}"
DEPLOY_MODE="${2:-live}"
if [[ ! "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "A full 40-character Git commit SHA is required." >&2
  exit 2
fi
if [[ "$DEPLOY_MODE" != "dark" && "$DEPLOY_MODE" != "live" ]]; then
  echo "Deployment mode must be dark or live." >&2
  exit 2
fi

SITE_USER="stagedeskpro"
SITE_HOME="/home/$SITE_USER"
SHARED_APP="$SITE_HOME/htdocs/stagedesk-app"
SHARED_ENV="$SHARED_APP/.env"
RELEASES_DIR="$SITE_HOME/releases"
CURRENT_LINK="$SITE_HOME/current"
RELEASE_DIR="$RELEASES_DIR/$DEPLOY_SHA"
REPOSITORY="https://github.com/uxamatahir8/stagedeskpronew.git"
ECOSYSTEM_FILE="$SITE_HOME/ecosystem.config.cjs"
NODE_BIN="$SITE_HOME/.nvm/versions/node/v22.23.4/bin"
NODE="$NODE_BIN/node"
PNPM_JS="$SITE_HOME/.nvm/versions/node/v22.23.4/lib/node_modules/corepack/dist/pnpm.js"
PM2="$NODE_BIN/pm2"
APP_HOST="www.stagedeskpro.com"
APP_PORT="3000"
HEALTH_BODY="/tmp/stagedesk-production-health-$DEPLOY_SHA.html"

if [[ "$(id -un)" != "$SITE_USER" ]]; then
  echo "Run this deployment as $SITE_USER." >&2
  exit 2
fi

test -f "$SHARED_ENV"
test -x "$NODE"
test -f "$PNPM_JS"
test -x "$PM2"

# Binding Next to the public address would let clients forge proxy headers.
# /etc/hosts must map the app hostname to loopback; nginx remains the public edge.
resolved_host="$(getent ahostsv4 "$APP_HOST" | awk 'NR == 1 { print $1 }')"
if [[ "$resolved_host" != "127.0.0.1" ]]; then
  echo "$APP_HOST must resolve to 127.0.0.1 on the production host (is $resolved_host)." >&2
  exit 1
fi

LOCK_FILE="$SITE_HOME/.stagedesk-production-deploy.lock"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another production deployment is already running." >&2
  exit 1
fi

mkdir -p "$RELEASES_DIR"
if [[ -e "$RELEASE_DIR" ]]; then
  echo "Release $DEPLOY_SHA already exists; refusing to overwrite it." >&2
  exit 1
fi

PREVIOUS_TARGET=""
if [[ -L "$CURRENT_LINK" && -e "$CURRENT_LINK" ]]; then
  PREVIOUS_TARGET="$(readlink -f "$CURRENT_LINK")"
fi

SWITCHED=0
DEPLOYED=0

run_pm2() {
  env \
    HOME="$SITE_HOME" \
    PM2_HOME="$SITE_HOME/.pm2" \
    PATH="$NODE_BIN:/usr/local/bin:/usr/bin:/bin" \
    "$PM2" "$@"
}

restart_services() {
  # Recreate processes so PM2 cannot retain paths from the previous release.
  run_pm2 delete stagedesk-production-web stagedesk-production-worker >/dev/null 2>&1 || true
  run_pm2 start "$ECOSYSTEM_FILE" --update-env
}

stop_services() {
  run_pm2 delete stagedesk-production-web stagedesk-production-worker >/dev/null 2>&1 || true
}

activate_release() {
  local target="$1"
  local next_link="$CURRENT_LINK.next"
  rm -f "$next_link"
  ln -s "$target" "$next_link"
  mv -Tf "$next_link" "$CURRENT_LINK"
}

write_ecosystem() {
  local web_instances="${WEB_INSTANCES:-1}"
  if [[ ! "$web_instances" =~ ^[1-2]$ ]]; then
    echo "WEB_INSTANCES must be 1-2 on this two-core host (is '$web_instances')." >&2
    exit 1
  fi
  local web_mode="fork"
  [[ "$web_instances" -gt 1 ]] && web_mode="cluster"
  cat > "$ECOSYSTEM_FILE" <<EOF
module.exports = {
  apps: [
    {
      name: "stagedesk-production-web",
      cwd: "$CURRENT_LINK",
      script: "$CURRENT_LINK/apps/web/node_modules/next/dist/bin/next",
      interpreter: "$NODE",
      node_args: "--env-file=$SHARED_ENV",
      args: "start $CURRENT_LINK/apps/web --hostname $APP_HOST --port $APP_PORT",
      env: { NODE_ENV: "production" },
      instances: $web_instances,
      exec_mode: "$web_mode",
      max_memory_restart: "1500M",
      time: true
    },
    {
      name: "stagedesk-production-worker",
      cwd: "$CURRENT_LINK",
      script: "$CURRENT_LINK/apps/worker/node_modules/tsx/dist/cli.mjs",
      interpreter: "$NODE",
      node_args: "--env-file=$SHARED_ENV",
      args: "$CURRENT_LINK/apps/worker/src/index.ts",
      env: { NODE_ENV: "production" },
      max_memory_restart: "1000M",
      time: true
    }
  ]
};
EOF
  chmod 600 "$ECOSYSTEM_FILE"
}

internal_health_check() {
  local attempt status
  for attempt in $(seq 1 30); do
    status="$(curl -sS -o "$HEALTH_BODY" -w '%{http_code}' \
      -H "Host: $APP_HOST" \
      -H "X-Forwarded-Host: $APP_HOST" \
      -H 'X-Forwarded-Proto: https' \
      "http://127.0.0.1:$APP_PORT/sign-in" || true)"
    if [[ "$status" == "200" ]] && grep -q '/_next/static/' "$HEALTH_BODY"; then
      rm -f "$HEALTH_BODY"
      return 0
    fi
    sleep 2
  done
  rm -f "$HEALTH_BODY"
  return 1
}

public_health_check() {
  local path code
  for path in /api/health / /nl /nl/sign-in /request /pricing; do
    code="$(curl -fsS -o /dev/null -w '%{http_code}' "https://$APP_HOST$path")"
    if [[ "$code" != "200" ]]; then
      echo "Public health check failed for $path with HTTP $code." >&2
      return 1
    fi
  done
}

on_exit() {
  local status=$?
  trap - EXIT
  rm -f "$HEALTH_BODY"

  if [[ $status -ne 0 ]]; then
    set +e
    if [[ $SWITCHED -eq 1 ]]; then
      if [[ -n "$PREVIOUS_TARGET" && -d "$PREVIOUS_TARGET" ]]; then
        echo "Deployment failed after activation; restoring $PREVIOUS_TARGET." >&2
        activate_release "$PREVIOUS_TARGET"
        write_ecosystem
        restart_services
        run_pm2 save
        internal_health_check
      else
        echo "First production activation failed; stopping the new processes." >&2
        stop_services
        rm -f "$CURRENT_LINK"
      fi
    fi
    if [[ $DEPLOYED -eq 0 && "$RELEASE_DIR" == "$RELEASES_DIR/"* ]]; then
      rm -rf -- "$RELEASE_DIR"
    fi
  fi

  exit "$status"
}
trap on_exit EXIT

echo "Cloning main commit $DEPLOY_SHA into a new production release."
git clone \
  --branch main \
  --single-branch \
  --depth 1 \
  "$REPOSITORY" \
  "$RELEASE_DIR"

ACTUAL_SHA="$(git -C "$RELEASE_DIR" rev-parse HEAD)"
if [[ "$ACTUAL_SHA" != "$DEPLOY_SHA" ]]; then
  echo "Expected $DEPLOY_SHA but origin/main is $ACTUAL_SHA." >&2
  exit 1
fi

ln -s "$SHARED_ENV" "$RELEASE_DIR/.env"

echo "Validating the production environment."
"$NODE" "$RELEASE_DIR/scripts/check-env.mjs" "$SHARED_ENV" web
"$NODE" "$RELEASE_DIR/scripts/check-env.mjs" "$SHARED_ENV" worker

run_pnpm() {
  env \
    HOME="$SITE_HOME" \
    PATH="$NODE_BIN:/usr/local/bin:/usr/bin:/bin" \
    CI=true \
    "$NODE" --env-file="$SHARED_ENV" "$PNPM_JS" --dir "$RELEASE_DIR" "$@"
}

echo "Installing locked dependencies."
run_pnpm install --frozen-lockfile

echo "Generating the Prisma client."
run_pnpm db:generate

echo "Applying production database migrations."
run_pnpm --filter @stagedesk/db run deploy

echo "Building StageDesk."
env \
  HOME="$SITE_HOME" \
  PATH="$NODE_BIN:/usr/local/bin:/usr/bin:/bin" \
  CI=true \
  NODE_ENV=production \
  "$NODE" --env-file="$SHARED_ENV" "$PNPM_JS" --dir "$RELEASE_DIR" build

write_ecosystem
activate_release "$RELEASE_DIR"
SWITCHED=1

echo "Starting StageDesk production web and worker processes."
restart_services
run_pm2 save

if ! internal_health_check; then
  echo "The new release failed its internal health check." >&2
  run_pm2 logs stagedesk-production-web --lines 80 --nostream --raw >&2 || true
  exit 1
fi

if [[ "$DEPLOY_MODE" == "live" ]]; then
  public_health_check
else
  echo "Dark launch passed; public checks are deferred until the nginx cutover."
fi

printf '%s\n' "$DEPLOY_SHA" > "$SITE_HOME/.stagedesk-production-release"
DEPLOYED=1
SWITCHED=0

ACTIVE_TARGET="$(readlink -f "$CURRENT_LINK")"
kept=0
while IFS= read -r old_release; do
  [[ "$old_release" == "$ACTIVE_TARGET" ]] && continue
  if [[ $kept -lt 4 ]]; then
    kept=$((kept + 1))
    continue
  fi
  if [[ "$old_release" == "$RELEASES_DIR/"* ]]; then
    rm -rf -- "$old_release"
  fi
done < <(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-)

echo "Production deployment complete: $DEPLOY_SHA ($DEPLOY_MODE mode)"
