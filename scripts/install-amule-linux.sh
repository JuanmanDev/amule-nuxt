#!/bin/bash
# Install aMule daemon on Linux (Ubuntu/Debian)

set -e

echo "aMule-Nuxt: Installing aMule daemon on Linux..."
echo ""

# Update package list
echo "Updating package lists..."
sudo apt update

# Install aMule daemon and utilities
echo "Installing aMule daemon..."
sudo apt install -y amule-daemon amule-utils amule-utils-gui

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
echo "2. Or manually configure ~/.aMule/amule.conf"
echo "3. Start aMule daemon: amuled -c ~/.aMule -o"
echo "4. Update .env file with EC credentials"
echo "5. Start the Nuxt app: npm run dev"
echo ""
