#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || realpath "${BASH_SOURCE[0]}" 2>/dev/null || echo "$0")")" && pwd)"
cd "$SCRIPT_DIR"

export PORTABLE_EXECUTABLE_DIR="$SCRIPT_DIR"

# Ensure execution permissions for all binaries
chmod +x "$SCRIPT_DIR/Ethernet" "$SCRIPT_DIR/ethernet" "$SCRIPT_DIR/chrome-sandbox" "$SCRIPT_DIR/chrome_crashpad_handler" "$SCRIPT_DIR/start.sh" "$SCRIPT_DIR/run.sh" 2>/dev/null || true

FLAGS=()
# Fallback to --no-sandbox if running as root or if unprivileged user namespaces are restricted (e.g. Ubuntu 24.04 AppArmor)
if [ "$EUID" -eq 0 ]; then
  FLAGS+=("--no-sandbox")
elif [ -f /proc/sys/kernel/apparmor_restrict_unprivileged_userns ] && [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null)" = "1" ]; then
  FLAGS+=("--no-sandbox")
fi

if [ ${#FLAGS[@]} -gt 0 ]; then
  exec "$SCRIPT_DIR/Ethernet" "${FLAGS[@]}" "$@"
else
  # Try launching normally first; if it crashes due to sandbox, retry with --no-sandbox
  "$SCRIPT_DIR/Ethernet" "$@" 2>/dev/null || exec "$SCRIPT_DIR/Ethernet" --no-sandbox "$@"
fi
