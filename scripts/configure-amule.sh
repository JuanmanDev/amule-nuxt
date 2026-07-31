#!/bin/bash
# Configure aMule daemon External Connection settings

set -e

AMULE_DIR="$HOME/.aMule"
AMULE_CONF="$AMULE_DIR/amule.conf"

echo "aMule-Nuxt: Configuring aMule daemon..."
echo ""

# Check if aMule is installed
if ! command -v amuled &> /dev/null; then
    echo "Error: aMule daemon is not installed."
    echo "Please run: npm run install:amule:wsl2 (or install:amule:linux)"
    exit 1
fi

# Create directory if needed
mkdir -p "$AMULE_DIR"

# Prompt for EC password
echo "Enter a password for External Connection (EC):"
read -s EC_PASSWORD
echo ""

# Compute MD5 hash for aMule config (aMule expects an MD5 hash in amule.conf)
EC_PASSWORD_HASH=$(echo -n "$EC_PASSWORD" | md5sum | awk '{print $1}')

# Create basic configuration if it doesn't exist
if [ ! -f "$AMULE_CONF" ]; then
    echo "Creating new aMule configuration..."
    
[ -n "$EC_PASSWORD_HASH" ] || EC_PASSWORD_HASH="$EC_PASSWORD"
    cat > "$AMULE_CONF" <<EOF
[eMule]
AppVersion=2.3.3
Nick=aMule-Nuxt-User
Port=4662
UDPPort=4672
TempDir=$HOME/amule-downloads/temp
IncomingDir=$HOME/amule-downloads/incoming
Autoconnect=1
MaxUpload=0
MaxDownload=0
MaxConnections=500
ConnectToKad=1
ConnectToED2K=1

[ExternalConnect]
AcceptExternalConnections=1
ECAddress=
ECPort=4712
ECPassword=$EC_PASSWORD_HASH
UPnPECEnabled=0

[WebServer]
Enabled=0
EOF

    echo "Configuration created at $AMULE_CONF"
else
    echo "Updating existing configuration..."
    
    # Update EC settings in existing config
    sed -i "s/^AcceptExternalConnections=.*/AcceptExternalConnections=1/" "$AMULE_CONF"
    sed -i "s/^ECPort=.*/ECPort=4712/" "$AMULE_CONF"
    sed -i "s/^ECPassword=.*/ECPassword=$EC_PASSWORD_HASH/" "$AMULE_CONF"
    
    echo "Configuration updated at $AMULE_CONF"
fi

# Update .env file
ENV_FILE=".env"
if [ -f ".env.example" ]; then
    if [ ! -f "$ENV_FILE" ]; then
        cp .env.example "$ENV_FILE"
        echo "Created .env file from .env.example"
    fi
    
    # Update password in .env
    sed -i "s/^AMULE_EC_PASSWORD=.*/AMULE_EC_PASSWORD=$EC_PASSWORD/" "$ENV_FILE"
    echo "Updated .env file with EC password"
fi

echo ""
echo "Configuration complete!"
echo ""
echo "To start aMule daemon:"
echo "  amuled -c $AMULE_DIR -o"
echo ""
echo "To test the connection:"
echo "  amulecmd -h localhost -p 4712 -P <password> -c status"
echo ""
echo "To start the Nuxt app:"
echo "  npm run dev"
echo ""
