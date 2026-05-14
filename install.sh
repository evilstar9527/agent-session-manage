#!/usr/bin/env bash
set -euo pipefail

REPO="${ASM_REPO:-evilstar9527/agent-session-manage}"
APP_NAME="Agent Session Manage.app"
INSTALL_DIR="${ASM_INSTALL_DIR:-/Applications}"
DMG_URL="${ASM_DMG_URL:-https://github.com/$REPO/releases/latest/download/Agent.Session.Manage-arm64.dmg}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Agent Session Manage desktop installer currently supports macOS only." >&2
  exit 1
fi

ARCH="$(uname -m)"
if [[ "$ARCH" != "arm64" ]]; then
  echo "Only macOS arm64 builds are currently published. Detected: $ARCH" >&2
  exit 1
fi

command -v curl >/dev/null 2>&1 || {
  echo "curl is required." >&2
  exit 1
}

command -v hdiutil >/dev/null 2>&1 || {
  echo "hdiutil is required." >&2
  exit 1
}

TMP_DIR="$(mktemp -d)"
DMG_PATH="$TMP_DIR/AgentSessionManage.dmg"
MOUNT_DIR="$TMP_DIR/mount"

cleanup() {
  if mount | grep -q "$MOUNT_DIR"; then
    hdiutil detach "$MOUNT_DIR" -quiet || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "Downloading $DMG_URL..."
curl -fL "$DMG_URL" -o "$DMG_PATH"

mkdir -p "$MOUNT_DIR"
echo "Mounting installer..."
hdiutil attach "$DMG_PATH" -mountpoint "$MOUNT_DIR" -nobrowse -quiet

APP_PATH="$MOUNT_DIR/$APP_NAME"
if [[ ! -d "$APP_PATH" ]]; then
  echo "Could not find $APP_NAME inside the DMG." >&2
  exit 1
fi

echo "Installing to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
if [[ -d "$INSTALL_DIR/$APP_NAME" ]]; then
  rm -rf "$INSTALL_DIR/$APP_NAME"
fi
cp -R "$APP_PATH" "$INSTALL_DIR/"

echo "Installed: $INSTALL_DIR/$APP_NAME"
echo "Open it with:"
echo "  open \"$INSTALL_DIR/$APP_NAME\""
