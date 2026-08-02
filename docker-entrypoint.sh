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
AppVersion=3.0.1
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
