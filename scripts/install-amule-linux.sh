#!/bin/bash
# Install the aMule daemon on Linux.
#
# Distributions still package aMule 2.3.3 (2021), so this installs the upstream
# 3.0.1 release AppImage instead. It is unpacked rather than run directly, which
# avoids the FUSE requirement; the unpacked launcher picks a binary out of the
# bundle by the name it was invoked as (read from ARGV0), so each entry point
# gets a small wrapper on PATH.

set -euo pipefail

AMULE_VERSION="${AMULE_VERSION:-3.0.1}"
PREFIX="${PREFIX:-$HOME/.local}"
BUNDLE_DIR="$PREFIX/lib/amule-$AMULE_VERSION"
BIN_DIR="$PREFIX/bin"

echo "aMule-Nuxt: installing aMule $AMULE_VERSION on Linux..."
echo ""

case "$(uname -m)" in
    x86_64)        APPIMAGE_ARCH=x64 ;;
    aarch64|arm64) APPIMAGE_ARCH=arm64 ;;
    *)
        echo "No aMule AppImage is published for $(uname -m)."
        echo "Fall back to the distribution package (aMule 2.3.3):"
        echo "  sudo apt install -y amule-daemon amule-utils"
        exit 1
        ;;
esac

APPIMAGE="aMule-$AMULE_VERSION-Linux-$APPIMAGE_ARCH.AppImage"
URL="https://github.com/amule-org/amule/releases/download/$AMULE_VERSION/$APPIMAGE"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Downloading $APPIMAGE..."
curl -fL --progress-bar -o "$TMP_DIR/$APPIMAGE" "$URL"

echo "Unpacking..."
chmod +x "$TMP_DIR/$APPIMAGE"
(cd "$TMP_DIR" && "./$APPIMAGE" --appimage-extract > /dev/null)

rm -rf "$BUNDLE_DIR"
mkdir -p "$(dirname "$BUNDLE_DIR")" "$BIN_DIR"
mv "$TMP_DIR/squashfs-root" "$BUNDLE_DIR"

echo "Installing wrappers into $BIN_DIR..."
for binary in amuled amulecmd amulegui amuleweb ed2k; do
    [ -x "$BUNDLE_DIR/usr/bin/$binary" ] || continue
    printf '#!/bin/sh\nexec env ARGV0=%s "%s/AppRun" "$@"\n' "$binary" "$BUNDLE_DIR" \
        > "$BIN_DIR/$binary"
    chmod +x "$BIN_DIR/$binary"
done

# amulecmd and amuleweb link against readline, which the bundle leaves out.
if ! ldconfig -p 2>/dev/null | grep -q 'libreadline\.so\.8'; then
    echo ""
    echo "Note: libreadline8 is missing and amulecmd needs it:"
    echo "  sudo apt install -y libreadline8"
fi

echo "Creating download directories..."
mkdir -p "$HOME/amule-downloads/incoming" "$HOME/amule-downloads/temp" "$HOME/.aMule"

echo ""
"$BIN_DIR/amuled" --version || true
echo ""
echo "aMule $AMULE_VERSION installed."
echo ""
case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *) echo "Add the wrappers to your PATH: export PATH=\"$BIN_DIR:\$PATH\"" ;;
esac
echo "Next steps:"
echo "1. Run the configuration script: npm run configure:amule"
echo "2. Start the daemon: amuled -c ~/.aMule -o"
echo "3. Update .env with the EC credentials"
echo "4. Start the Nuxt app: npm run dev"
echo ""
