#!/usr/bin/env bash
# Registers the native messaging host so the extension can move the real mouse cursor.
# Usage: ./install-native-host.sh <chrome-extension-id>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ $# -ge 1 ]; then
  EXT_ID="$1"
else
  EXT_ID=""
  for PREFS in \
    "$HOME/.config/google-chrome/Default/Preferences" \
    "$HOME/.config/chromium/Default/Preferences"; do
    [ -f "$PREFS" ] || continue
    FOUND="$(python3 - "$PREFS" "$PROJECT_DIR" <<'PY'
import json, os, sys
prefs_path, project_dir = sys.argv[1], sys.argv[2]
with open(prefs_path) as f:
    data = json.load(f)
for eid, info in data.get("extensions", {}).get("settings", {}).items():
    path = info.get("path", "")
    if path and os.path.normpath(path) == os.path.normpath(project_dir):
        print(eid)
        break
PY
)" 2>/dev/null || true
    if [ -n "$FOUND" ]; then
      EXT_ID="$FOUND"
      break
    fi
  done
fi

if [ -z "${EXT_ID:-}" ]; then
  echo "Usage: $0 [extension-id]"
  echo ""
  echo "Could not auto-detect extension ID. Find it at chrome://extensions"
  echo "(Developer mode → ID under Orion)."
  exit 1
fi

echo "Using extension ID: $EXT_ID"
HOST_PATH="$SCRIPT_DIR/mouse_mover_host.py"

chmod +x "$HOST_PATH"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Error: python3 is required."
  exit 1
fi

if ! command -v xdotool >/dev/null 2>&1 && ! command -v ydotool >/dev/null 2>&1; then
  echo "Warning: neither xdotool nor ydotool found."
  echo "  X11:  sudo apt install xdotool"
  echo "  Wayland: sudo apt install ydotool  (and run: ydotoold &)"
fi

MANIFEST_JSON="$(cat <<EOF
{
  "name": "com.autoscroll.mouse_mover",
  "description": "Moves the system mouse for Orion",
  "path": "$HOST_PATH",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://${EXT_ID}/"
  ]
}
EOF
)"

HOST_DIRS=(
  "$HOME/.config/google-chrome/NativeMessagingHosts"
  "$HOME/.config/chromium/NativeMessagingHosts"
  "$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
  "$HOME/.config/microsoft-edge/NativeMessagingHosts"
)

INSTALLED=0
for DIR in "${HOST_DIRS[@]}"; do
  mkdir -p "$DIR"
  echo "$MANIFEST_JSON" > "$DIR/com.autoscroll.mouse_mover.json"
  echo "Installed: $DIR/com.autoscroll.mouse_mover.json"
  INSTALLED=1
done

if [ "$INSTALLED" -eq 0 ]; then
  echo "No browser config directories found."
  exit 1
fi

echo ""
echo "Done. Reload the extension at chrome://extensions, then restart Chrome completely."
