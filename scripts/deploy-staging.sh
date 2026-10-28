#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_SHA="${1:-}"
if [[ ! "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "A full 40-character Git commit SHA is required." >&2
  exit 2
fi

SITE_USER="stagedeskpro-staging"
SITE_HOME="/home/$SITE_USER"
ORIGINAL_APP="$SITE_HOME/htdocs/stagedesk-app"
SHARED_ENV="$ORIGINAL_APP/.env"
RELEASES_DIR="$SITE_HOME/releases"
CURRENT_LINK="$SITE_HOME/current"
RELEASE_DIR="$RELEASES_DIR/$DEPLOY_SHA"
REPOSITORY="https://github.com/uxamatahir8/stagedeskpronew.git"
ECOSYSTEM_FILE="$SITE_HOME/ecosystem.config.cjs"
NODE_BIN="$SITE_HOME/.nvm/versions/node/v22.23.4/bin"
NODE="$NODE_BIN/node"
PNPM_JS="$SITE_HOME/.nvm/versions/node/v22.23.4/lib/node_modules/corepack/dist/pnpm.js"
PM2="$NODE_BIN/pm2"
HEALTH_BODY="/tmp/stagedesk-health-$DEPLOY_SHA.html"

if [[ "$(id -un)" != "$SITE_USER" ]]; then
  echo "Run this deployment as $SITE_USER." >&2
  exit 2
fi

test -f "$SHARED_ENV"
test -x "$NODE"
test -f "$PNPM_JS"
test -x "$PM2"

LOCK_FILE="$SITE_HOME/.stagedesk-staging-deploy.lock"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another staging deployment is already running." >&2
  exit 1
fi

mkdir -p "$RELEASES_DIR"

if [[ -e "$RELEASE_DIR" ]]; then
  echo "Release $DEPLOY_SHA already exists; refusing to overwrite it." >&2
  exit 1
fi

PREVIOUS_TARGET="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"
if [[ -z "$PREVIOUS_TARGET" ]]; then
  PREVIOUS_TARGET="$ORIGINAL_APP"
fi
test -d "$PREVIOUS_TARGET"

SWITCHED=0
DEPLOYED=0

run_pm2() {
  env \
    HOME="$SITE_HOME" \
    PM2_HOME="$SITE_HOME/.pm2" \
    PATH="$NODE_BIN:/usr/local/bin:/usr/bin:/bin" \
    "$PM2" "$@"
}

activate_release() {
  local target="$1"
  local next_link="$CURRENT_LINK.next"
  rm -f "$next_link"
  ln -s "$target" "$next_link"
  mv -Tf "$next_link" "$CURRENT_LINK"
}

write_ecosystem() {
  cat > "$ECOSYSTEM_FILE" <<EOF
module.exports = {
  apps: [
    {
      name: "stagedesk-web",
      cwd: "$CURRENT_LINK",
      script: "$CURRENT_LINK/apps/web/node_modules/next/dist/bin/next",
      interpreter: "$NODE",
      node_args: "--env-file=$SHARED_ENV",
      args: "start $CURRENT_LINK/apps/web --hostname staging.stagedeskpro.com --port 3100",
      env: { NODE_ENV: "production" },
      max_memory_restart: "1500M",
      time: true
    },
    {
      name: "stagedesk-worker",
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

health_check() {
  local attempt status
  for attempt in $(seq 1 30); do
    status="$(curl -sS -o "$HEALTH_BODY" -w '%{http_code}' \
      -H 'Host: staging.stagedeskpro.com' \
      -H 'X-Forwarded-Host: staging.stagedeskpro.com' \
      -H 'X-Forwarded-Proto: https' \
      http://127.0.0.1:3100/sign-in || true)"
    if [[ "$status" == "200" ]] && grep -q '/_next/static/' "$HEALTH_BODY"; then
      rm -f "$HEALTH_BODY"
      return 0
    fi
    sleep 2
  done
  rm -f "$HEALTH_BODY"
  return 1
}

on_exit() {
  local status=$?
  trap - EXIT
  rm -f "$HEALTH_BODY"

  if [[ $status -ne 0 ]]; then
    set +e
    if [[ $SWITCHED -eq 1 ]]; then
      echo "Deployment failed after activation; restoring $PREVIOUS_TARGET." >&2
      activate_release "$PREVIOUS_TARGET"
      write_ecosystem
      run_pm2 startOrRestart "$ECOSYSTEM_FILE" --update-env
      run_pm2 save
      health_check
    fi
    if [[ $DEPLOYED -eq 0 && "$RELEASE_DIR" == "$RELEASES_DIR/"* ]]; then
      rm -rf -- "$RELEASE_DIR"
    fi
  fi

  exit "$status"
}
trap on_exit EXIT

echo "Cloning staging commit $DEPLOY_SHA into a new release."
git clone \
  --branch staging \
  --single-branch \
  --depth 1 \
  "$REPOSITORY" \
  "$RELEASE_DIR"

ACTUAL_SHA="$(git -C "$RELEASE_DIR" rev-parse HEAD)"
if [[ "$ACTUAL_SHA" != "$DEPLOY_SHA" ]]; then
  echo "Expected $DEPLOY_SHA but origin/staging is $ACTUAL_SHA." >&2
  exit 1
fi

ln -s "$SHARED_ENV" "$RELEASE_DIR/.env"

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

echo "Building StageDesk."
env \
  HOME="$SITE_HOME" \
  PATH="$NODE_BIN:/usr/local/bin:/usr/bin:/bin" \
  CI=true \
  NODE_ENV=production \
  "$NODE" --env-file="$SHARED_ENV" "$PNPM_JS" --dir "$RELEASE_DIR" build

echo "Applying production database migrations."
run_pnpm --filter @stagedesk/db deploy

write_ecosystem
activate_release "$RELEASE_DIR"
SWITCHED=1

echo "Restarting StageDesk web and worker processes."
run_pm2 startOrRestart "$ECOSYSTEM_FILE" --update-env
run_pm2 save

if ! health_check; then
  echo "The new release failed its internal health check." >&2
  exit 1
fi

for path in / /request /pricing; do
  code="$(curl -fsS -o /dev/null -w '%{http_code}' "https://staging.stagedeskpro.com$path")"
  if [[ "$code" != "200" ]]; then
    echo "Public health check failed for $path with HTTP $code." >&2
    exit 1
  fi
done

printf '%s\n' "$DEPLOY_SHA" > "$SITE_HOME/.stagedesk-staging-release"
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

echo "Deployment complete: $DEPLOY_SHA"
