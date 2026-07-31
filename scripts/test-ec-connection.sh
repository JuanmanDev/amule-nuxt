#!/bin/bash
set -e

# Simple helper to test EC connection using provided password
AMULE_EC_HOST=${AMULE_EC_HOST:-localhost}
AMULE_EC_PORT=${AMULE_EC_PORT:-4712}

if [ -z "$AMULE_EC_PASSWORD" ]; then
    echo "AMULE_EC_PASSWORD is not set. Export it or pass it in the environment." >&2
    exit 2
fi

echo "Testing aMule EC connection to ${AMULE_EC_HOST}:${AMULE_EC_PORT}..."

if amulecmd -h "$AMULE_EC_HOST" -p "$AMULE_EC_PORT" -P "$AMULE_EC_PASSWORD" -c status; then
    echo "Connection successful"
    exit 0
else
    echo "Connection failed" >&2
    exit 1
fi
