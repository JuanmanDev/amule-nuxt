#!/bin/bash
# bash rather than sh: the supervision at the bottom uses arrays and `kill -0`
# loops over them, which the Debian base image's /bin/sh (dash) does not do well.
set -e

# What this container runs. The image can be used three ways, and the entrypoint
# is the only difference between them:
#
#   all    the daemon and the web app together (default for the full image)
#   web    the web app only, talking EC to a daemon elsewhere
#   amule  the daemon only, for a container the web app connects to
#
# The web-only image sets SERVICES=web in the Dockerfile and ships no daemon.
SERVICES="${SERVICES:-all}"

run_amule=false
run_web=false

# One case rather than a chain of tests: under `set -e` a failing `[ … ] && …`
# ends the script instead of just skipping the assignment.
case "${SERVICES}" in
    all) run_amule=true; run_web=true ;;
    web) run_web=true ;;
    amule) run_amule=true ;;
    *)
        echo "SERVICES must be one of all, web or amule (got '${SERVICES}')" >&2
        exit 1
        ;;
esac

if [ "${run_amule}" = true ] && ! command -v amuled > /dev/null 2>&1; then
    echo "SERVICES=${SERVICES} asks for the daemon, but this image does not ship amuled." >&2
    echo "Use the full image, or set SERVICES=web and point AMULE_EC_HOST at a daemon." >&2
    exit 1
fi

echo "Starting aMule-Nuxt container (SERVICES=${SERVICES})..."

# Configuration paths
AMULE_HOME="/home/amule/.aMule"
AMULE_CONF="${AMULE_HOME}/amule.conf"
REMOTE_CONF="${AMULE_HOME}/remote.conf"

if [ "${run_amule}" = true ]; then
    # Create aMule configuration if it doesn't exist
    if [ ! -f "${AMULE_CONF}" ]; then
        echo "Creating aMule configuration..."
        mkdir -p "${AMULE_HOME}"

        # Compute MD5 hash for aMule EC password field (aMule expects an MD5 hash in amule.conf)
        EC_PASSWORD_HASH=$(echo -n "${AMULE_EC_PASSWORD}" | md5sum | awk '{print $1}')

        # A daemon in its own container is reached from another one, so EC has to
        # listen on every interface there; in the all-in-one image the web app is
        # on loopback and the default empty address is enough.
        if [ "${SERVICES}" = "amule" ]; then
            EC_ADDRESS="${AMULE_EC_BIND:-0.0.0.0}"
        else
            EC_ADDRESS="${AMULE_EC_BIND:-}"
        fi

        cat > "${AMULE_CONF}" <<EOF
[eMule]
AppVersion=3.1.0
Nick=aMule-Nuxt
QueueSizePref=50
MaxUpload=0
MaxDownload=0
# aMule 3.x default: the old 2 kB/s value sliced uploads into so many sub-slots
# that fast peers were shaped down to a trickle.
SlotAllocation=10
Port=4662
UDPPort=4672
UDPEnable=1
Address=
Autoconnect=1
MaxSourcesPerFile=300
MaxConnections=500
MaxConnectionsPerFiveSeconds=20
RemoveDeadServer=1
DeadServerRetry=3
ServerKeepAliveTimeout=0
Reconnect=1
Scoresystem=1
Serverlist=0
AddServerListFromServer=0
AddServerListFromClient=0
SafeServerConnect=0
AutoConnectStaticOnly=0
UPnPEnabled=0
UPnPTCPPort=0
SmartIdCheck=1
ConnectToKad=1
ConnectToED2K=1
TempDir=/downloads/temp
IncomingDir=/downloads/incoming

[ExternalConnect]
AcceptExternalConnections=1
ECAddress=${EC_ADDRESS}
ECPort=${AMULE_EC_PORT}
ECPassword=${EC_PASSWORD_HASH}
UPnPECEnabled=0
ShowProgressBar=1
ShowPercent=1

[WebServer]
Enabled=0
EOF
        echo "aMule configuration created at ${AMULE_CONF}"
    fi

    # Create remote configuration if it doesn't exist
    if [ ! -f "${REMOTE_CONF}" ]; then
        echo "Creating remote configuration..."
        cat > "${REMOTE_CONF}" <<EOF
[EC]
Host=localhost
Port=${AMULE_EC_PORT}
Password=${AMULE_EC_PASSWORD}
EOF
        echo "Remote configuration created at ${REMOTE_CONF}"
    fi

    # Set permissions
    chmod -R 755 "${AMULE_HOME}"
    chmod -R 777 /downloads
fi

# amuleapi: the REST daemon aMule 3.1 ships. The web app asks it first and falls
# back to EC (see server/utils/amule-backend.ts), so it is started next to amuled
# whenever there is a password for it:
#
#   all    no password needed: nobody outside the container talks to it, so a
#          fresh random one is made on every start and handed to the web app
#   amule  only with AMULE_API_PASSWORD set - other containers reach it, and it
#          should not be open with a password nobody knows
#
# AMULE_API_ENABLED=false skips it, leaving the app on EC alone.
AMULE_API_PORT="${AMULE_API_PORT:-4713}"
run_amuleapi=false
if [ "${run_amule}" = true ] && [ "${AMULE_API_ENABLED:-true}" != "false" ] \
    && command -v amuleapi > /dev/null 2>&1; then
    if [ -z "${AMULE_API_PASSWORD}" ] && [ "${run_web}" = true ]; then
        AMULE_API_PASSWORD="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')"
    fi
    if [ -n "${AMULE_API_PASSWORD}" ]; then
        run_amuleapi=true
    fi
fi

if [ "${run_amuleapi}" = true ]; then
    # Loopback in the all-in-one layout, where only the web app beside it needs it;
    # every interface for a daemon container, where the web app is elsewhere.
    if [ "${SERVICES}" = "amule" ]; then
        API_BIND="${AMULE_API_BIND:-0.0.0.0}"
    else
        API_BIND="${AMULE_API_BIND:-127.0.0.1}"
    fi

    # Rewritten on every start so a changed port or password takes effect. The EC
    # password is the plain one: amuleapi logs in to amuled like any EC client.
    cat > "${AMULE_HOME}/amuleapi.conf" <<EOF
[Server]
BindAddress=${API_BIND}
Port=${AMULE_API_PORT}

[EC]
Host=127.0.0.1
Port=${AMULE_EC_PORT}
Password=${AMULE_EC_PASSWORD}
EOF
    chmod 600 "${AMULE_HOME}/amuleapi.conf"

    # Stored salted and stretched in amuleapi-passwords; the command exits at once.
    # A failure here costs amuleapi, not the container: the app still has EC.
    if amuleapi --config-dir="${AMULE_HOME}" --set-admin-pass="${AMULE_API_PASSWORD}" > /dev/null; then
        # The web app in this container reads these
        export AMULE_API_PASSWORD
        export AMULE_API_HOST="${AMULE_API_HOST:-localhost}"
        export AMULE_API_PORT
    else
        echo "Warning: could not set the amuleapi password; the web app will use EC only." >&2
        run_amuleapi=false
    fi
fi

# Every started process, so the supervision loop below can watch all of them
PIDS=()
NAMES=()

if [ "${run_amule}" = true ]; then
    echo "Starting aMule daemon..."
    amuled -c "${AMULE_HOME}" -o &
    PIDS+=($!)
    NAMES+=("the aMule daemon")

    # Wait a bit for aMule to start
    sleep 3

    # Test aMule connection
    echo "Testing aMule connection..."
    if amulecmd -h localhost -p "${AMULE_EC_PORT}" -P "${AMULE_EC_PASSWORD}" -c "status" > /dev/null 2>&1; then
        echo "aMule daemon started successfully"
    else
        echo "Warning: aMule daemon may not be fully ready yet"
    fi
fi

if [ "${run_amuleapi}" = true ]; then
    # Not supervised as fatal: if it stops, the web app carries on over EC.
    echo "Starting amuleapi (REST API) on ${API_BIND}:${AMULE_API_PORT}..."
    amuleapi --config-dir="${AMULE_HOME}" --host=127.0.0.1 --port="${AMULE_EC_PORT}" \
        --bind="${API_BIND}" --http-port="${AMULE_API_PORT}" --no-log-file &
fi

if [ "${run_web}" = true ]; then
    # Live updates listen on their own port, and the browser is told which one
    # through the public runtime config - a value baked when the app was built. So
    # WS_PORT on its own would move this listener while clients kept dialling the
    # built-in 3001 and silently fell back to polling. NUXT_PUBLIC_WS_PORT is the
    # name Nitro reads at runtime, so it follows WS_PORT unless it was set by hand.
    export WS_PORT="${WS_PORT:-3001}"
    export NUXT_PUBLIC_WS_PORT="${NUXT_PUBLIC_WS_PORT:-${WS_PORT}}"

    if [ "${SERVICES}" = "web" ]; then
        echo "Reaching the daemon at ${AMULE_EC_HOST:-localhost}:${AMULE_EC_PORT}"
        if [ -z "${AMULE_EC_PASSWORD}" ]; then
            echo "Warning: AMULE_EC_PASSWORD is empty; the daemon will refuse the connection." >&2
        fi
    fi

    # Start Nuxt application
    # Nitro reads PORT/HOST, so map the container's NUXT_PORT onto them; otherwise
    # the server always binds the built-in default and NUXT_PORT is silently ignored.
    echo "Starting Nuxt application on port ${NUXT_PORT}..."
    cd /app
    PORT="${NUXT_PORT}" HOST="0.0.0.0" node .output/server/index.mjs &
    PIDS+=($!)
    NAMES+=("the Nuxt server")
fi

echo "All services started!"
if [ "${run_amule}" = true ]; then
    echo "  - aMule daemon: localhost:${AMULE_EC_PORT}"
fi
if [ "${run_amuleapi}" = true ]; then
    echo "  - amuleapi (REST API + Web UI): ${API_BIND}:${AMULE_API_PORT}"
fi
if [ "${run_web}" = true ]; then
    echo "  - Nuxt web UI: http://localhost:${NUXT_PORT}"
    echo "  - Live updates: ws://localhost:${WS_PORT} (publish this port too, or the UI polls)"
fi
echo ""

# Supervise the started processes explicitly rather than with a bare `wait -n`:
# that returns for *any* reaped child (the startup amulecmd check among them), so
# the container could stop while everything was still running, and it never said
# which side had gone. Polling the PIDs keeps the container up as long as they all
# live and names the one that died.
all_alive() {
    local pid
    for pid in "${PIDS[@]}"; do
        kill -0 "${pid}" 2>/dev/null || return 1
    done
    return 0
}

while all_alive; do
    sleep 5
done

STATUS=0
for index in "${!PIDS[@]}"; do
    pid="${PIDS[${index}]}"
    if kill -0 "${pid}" 2>/dev/null; then
        # Still running: it is not the one that brought the container down
        kill "${pid}" 2>/dev/null || true
    else
        echo "${NAMES[${index}]} exited; stopping the container." >&2
        wait "${pid}" || STATUS=$?
    fi
done

# Give the survivors a moment to shut down before the container goes away
wait 2>/dev/null || true
exit "${STATUS}"
