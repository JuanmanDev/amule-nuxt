#!/bin/bash
# Install the aMule daemon on WSL2 (Ubuntu/Debian).
#
# Same approach as install-amule-linux.sh: the distribution package is aMule
# 2.3.3, so the upstream 3.0.1 AppImage is unpacked into ~/.local instead. WSL2
# ships no FUSE by default, which is exactly why the bundle is unpacked rather
# than executed in place.

set -euo pipefail

echo "aMule-Nuxt: installing the aMule daemon on WSL2..."
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$SCRIPT_DIR/install-amule-linux.sh"

echo "WSL2 notes:"
echo "- The daemon listens inside WSL2. Either run this app inside WSL2 as well,"
echo "  or set ECAddress=0.0.0.0 in amule.conf and point AMULE_EC_HOST at the"
echo "  WSL2 address from 'hostname -I'."
echo "- Windows Firewall may need to allow the eD2k / Kad ports for a High ID."
echo ""
echo "Next steps:"
echo "1. Run the configuration script: npm run configure:amule"
echo "2. Start the daemon: amuled -c ~/.aMule -o"
echo "3. Update .env with your EC password"
echo "4. Start the Nuxt app: npm run dev"
echo ""
