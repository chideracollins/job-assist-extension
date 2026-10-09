#!/usr/bin/env bash
# Job Assist — enable the Hermes API server for a profile (idempotent).
#
# The Job Assist extension talks to Hermes through the OpenAI-compatible API
# server that the gateway exposes. This script appends the required env vars
# to a profile's .env (default: career-os) if they are not already there.
#
# Usage:  ./scripts/enable_api_server.sh [profile]
# After running it, restart Hermes (quit + relaunch the desktop app, or
# run `hermes -p <profile> gateway`) and put the printed key in the
# extension's Options → API key.
set -euo pipefail

PROFILE="${1:-career-os}"
HERMES_HOME_DIR="${HERMES_HOME:-$HOME/.hermes}"
PROFILE_DIR="$HERMES_HOME_DIR/profiles/$PROFILE"
ENV_FILE="$PROFILE_DIR/.env"

if [[ ! -d "$PROFILE_DIR" ]]; then
  echo "Profile directory not found: $PROFILE_DIR" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "No .env found at $ENV_FILE — create it first." >&2
  exit 1
fi

if grep -q '^API_SERVER_ENABLED=' "$ENV_FILE"; then
  echo "API server is already configured in $ENV_FILE (no changes made)."
  echo "If you need a fresh key, remove the API_SERVER_* lines and re-run."
  exit 0
fi

API_KEY="$(openssl rand -hex 16 2>/dev/null || uuidgen | tr -d '-')"

{
  echo ""
  echo "# Job Assist extension: local API server (added $(date -u +%Y-%m-%dT%H:%M:%SZ))"
  echo "API_SERVER_ENABLED=true"
  echo "API_SERVER_PORT=8642"
  echo "API_SERVER_KEY=$API_KEY"
} >> "$ENV_FILE"

echo "Enabled the API server on port 8642 for profile '$PROFILE'."
echo ""
echo "API key — put this in the extension's Options → API key:"
echo "  $API_KEY"
echo ""
echo "Next steps:"
echo "  1. Restart Hermes so the gateway picks up the change:"
echo "       hermes -p $PROFILE gateway        # or quit + relaunch the desktop app"
echo "  2. Verify it is listening:"
echo "       curl -H \"Authorization: Bearer $API_KEY\" http://127.0.0.1:8642/v1/models"
