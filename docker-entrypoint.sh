#!/bin/sh
set -e

echo "Starting aMule-Nuxt Docker Container..."

# Configuration paths
AMULE_HOME="/home/amule/.aMule"
AMULE_CONF="${AMULE_HOME}/amule.conf"
REMOTE_CONF="${AMULE_HOME}/remote.conf"

# Create aMule configuration if it doesn't exist
if [ ! -f "${AMULE_CONF}" ]; then
    echo "Creating aMule configuration..."
    mkdir -p "${AMULE_HOME}"
    
    # Generate encoded password (simple MD5 for demo - in production use amulecmd --create-config-from)
    cat > "${AMULE_CONF}" <<EOF
[eMule]
AppVersion=2.3.3
Nick=aMule-Nuxt
QueueSizePref=50
MaxUpload=0
MaxDownload=0
SlotAllocation=2
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
ECAddress=
ECPort=${AMULE_EC_PORT}
ECPassword=${AMULE_EC_PASSWORD}
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

# Start aMule daemon in background
echo "Starting aMule daemon..."
amuled -c "${AMULE_HOME}" -o &
AMULE_PID=$!

# Waita bit for aMule to start
sleep 3

# Test aMule connection
echo "Testing aMule connection..."
if amulecmd -h localhost -p "${AMULE_EC_PORT}" -P "${AMULE_EC_PASSWORD}" -c "status" > /dev/null 2>&1; then
    echo "aMule daemon started successfully"
else
    echo "Warning: aMule daemon may not be fully ready yet"
fi

# Start Nuxt application
echo "Starting Nuxt application on port ${NUXT_PORT}..."
cd /app
node .output/server/index.mjs &
NUXT_PID=$!

echo "All services started!"
echo "  - aMule daemon: localhost:${AMULE_EC_PORT}"
echo "  - Nuxt web UI: http://localhost:${NUXT_PORT}"
echo ""

# Wait for any process to exit
wait -n

# Exit with status of process that exited first
exit $?
