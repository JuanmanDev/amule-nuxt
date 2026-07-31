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

echo "aMule Nuxt listening on http://0.0.0.0:${PORT} (daemon ${AMULE_EC_HOST:-localhost}:${AMULE_EC_PORT:-4712})"
exec node .output/server/index.mjs
