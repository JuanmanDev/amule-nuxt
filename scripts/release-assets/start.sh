#!/usr/bin/env bash
# Starts the bundled Nitro server. The production build does not read .env by
# itself, so this script exports it first.
set -euo pipefail

cd "$(dirname "$0")"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
else
  echo "No .env found; falling back to the current environment." >&2
fi

if [ -z "${AMULE_EC_PASSWORD:-}" ]; then
  echo "AMULE_EC_PASSWORD is not set: every External Connection call will be refused." >&2
fi

export NODE_ENV="${NODE_ENV:-production}"
export NUXT_PORT="${NUXT_PORT:-3000}"
# Nitro reads PORT; keep it in step with NUXT_PORT so both spellings work.
export PORT="${PORT:-$NUXT_PORT}"

# Live updates listen on their own port, and the browser is told which one through
# the public runtime config. That value is baked at build time, so WS_PORT alone
# would move the listener and leave clients dialling 3001; NUXT_PUBLIC_WS_PORT is
# what Nitro reads at runtime, so it follows WS_PORT here.
export WS_PORT="${WS_PORT:-3001}"
export NUXT_PUBLIC_WS_PORT="${NUXT_PUBLIC_WS_PORT:-$WS_PORT}"

echo "aMule Nuxt listening on http://0.0.0.0:${PORT}, live updates on ${WS_PORT} (daemon ${AMULE_EC_HOST:-localhost}:${AMULE_EC_PORT:-4712})"
exec node .output/server/index.mjs
