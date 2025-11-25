#!/bin/bash
# Install aMule daemon on WSL2 (Ubuntu/Debian)

set -e

echo "aMule-Nuxt: Installing aMule daemon on WSL2..."
echo ""

# Update package list
echo "Updating package lists..."
sudo apt update

# Install aMule daemon and utilities
echo "Installing aMule daemon..."
sudo apt install -y amule-daemon amule-utils

# Create aMule configuration directory
echo "Creating aMule configuration directory..."
mkdir -p ~/.aMule

# Create download directories
echo "Creating download directories..."
mkdir -p ~/amule-downloads/incoming
mkdir -p ~/amule-downloads/temp

echo ""
echo "aMule daemon installed successfully!"
echo ""
echo "Next steps:"
echo "1. Run the configuration script: npm run configure:amule"
echo "2. Or manually edit ~/.aMule/amule.conf to set:"
echo "   - AcceptExternalConnections=1"
echo "   - ECPassword=<your-password>"
echo "   - ECPort=4712"
echo "3. Start aMule daemon: amuled -c ~/.aMule -o"
echo "4. Update .env file with your EC password"
echo "5. Start the Nuxt app: npm run dev"
echo ""
