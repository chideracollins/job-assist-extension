#!/usr/bin/env bash
# Job Assist — enable the Hermes API server (idempotent, self-verifying).
#
# The Job Assist extension talks to Hermes through the OpenAI-compatible API
# server that the gateway exposes. On multiplexed installs the DEFAULT profile
# owns the ONE shared HTTP listener (the api_server platform), so the required
# env vars must live in BOTH the target profile's .env and the default
# profile's .env. This script ensures both files carry API_SERVER_ENABLED,
# API_SERVER_PORT, API_SERVER_KEY (one shared key; an existing key is reused
# so the extension's saved key stays valid), and API_SERVER_CORS_ORIGINS —
# the gateway rejects ANY request carrying an Origin header that is not
# allowlisted, and Chrome extensions always send Origin:
# chrome-extension://<id>, so without the allowlist every extension request
# 403s (that is the "Connected but not generating" bug). The extension's
# manifest.json pins a "key", which makes its extension ID deterministic on
# every machine, so one allowlisted origin works for all installs. The script
# then verifies the server responds and prints the model id it auto-detects.
#
# Usage:  ./scripts/enable_api_server.sh [profile]
# After running it: restart the gateway (hermes -p default gateway restart,
# or relaunch the desktop app), then put the printed key in Options → API key.
set -euo pipefail

HERMES_HOME_DIR="${HERMES_HOME:-$HOME/.hermes}"

# HERMES_HOME may point at a profile home (…/profiles/<name>) when a profile is
# active in the shell. Walk up to the root that contains the profiles/ dir.
if [[ ! -d "$HERMES_HOME_DIR/profiles" && "$(basename "$(dirname "$HERMES_HOME_DIR")")" == "profiles" ]]; then
  HERMES_HOME_DIR="$(dirname "$(dirname "$HERMES_HOME_DIR")")"
fi

PROFILE="${1:-}"

# Auto-detect the profile when the caller does not pass one (only if unambiguous).
if [[ -z "$PROFILE" ]]; then
  FOUND=()
  if [[ -d "$HERMES_HOME_DIR/profiles" ]]; then
    while IFS= read -r d; do
      [[ -n "$d" ]] && FOUND+=("$d")
    done < <(find "$HERMES_HOME_DIR/profiles" -maxdepth 1 -mindepth 1 -type d -exec basename {} \; | sort)
  fi
  if [[ ${#FOUND[@]} -eq 1 ]]; then
    PROFILE="${FOUND[0]}"
    echo "Detected profile: $PROFILE"
  elif [[ ${#FOUND[@]} -gt 1 ]]; then
    echo "Multiple profiles found: ${FOUND[*]}" >&2
    echo "Usage: ./scripts/enable_api_server.sh <profile-name>" >&2
    exit 1
  else
    echo "No profiles found under $HERMES_HOME_DIR/profiles — create one first:" >&2
    echo "  hermes profile create <name>" >&2
    exit 1
  fi
fi

if [[ "$PROFILE" == "default" ]]; then
  ENV_FILE="$HERMES_HOME_DIR/.env"
  DEFAULT_ENV_FILE="$ENV_FILE"
else
  PROFILE_DIR="$HERMES_HOME_DIR/profiles/$PROFILE"
  if [[ ! -d "$PROFILE_DIR" ]]; then
    echo "Profile directory not found: $PROFILE_DIR" >&2
    echo "Create it with: hermes profile create $PROFILE" >&2
    exit 1
  fi
  ENV_FILE="$PROFILE_DIR/.env"
  DEFAULT_ENV_FILE="$HERMES_HOME_DIR/.env"
fi

# Reuse an existing key if one is already set (keeps the extension's saved key
# valid across re-runs); otherwise mint a strong one.
API_KEY=""
if [[ -f "$ENV_FILE" ]]; then
  API_KEY="$(sed -n 's/^API_SERVER_KEY=//p' "$ENV_FILE" | tail -1)"
fi
if [[ -z "$API_KEY" && -f "$DEFAULT_ENV_FILE" ]]; then
  API_KEY="$(sed -n 's/^API_SERVER_KEY=//p' "$DEFAULT_ENV_FILE" | tail -1)"
fi
if [[ -z "$API_KEY" ]]; then
  API_KEY="$(openssl rand -hex 16 2>/dev/null || uuidgen | tr -d '-')"
fi

write_managed_entries() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    mkdir -p "$(dirname "$file")"
    : > "$file"
  fi
  local tmp
  tmp="$(mktemp "${file}.XXXXXX")"
  # Strip any previous managed lines, keep everything else the user set.
  sed '/^API_SERVER_ENABLED=/d; /^API_SERVER_PORT=/d; /^API_SERVER_KEY=/d; /^API_SERVER_CORS_ORIGINS=/d' "$file" > "$tmp"
  {
    echo ""
    echo "# Job Assist extension: local OpenAI-compatible API server (managed $(date -u +%Y-%m-%dT%H:%M:%SZ))"
    echo "API_SERVER_ENABLED=true"
    echo "API_SERVER_PORT=8642"
    echo "API_SERVER_KEY=$API_KEY"
    echo "# The extension sends Origin: chrome-extension://<id>; the gateway 403s any"
    echo "# request with a non-allowlisted Origin. First ID = pinned via manifest key"
    echo "# (works on any machine/path); second = the path-derived ID this repo gets"
    echo "# when cloned to ~/Repo/job-assist-extension (covers existing installs"
    echo "# that have not reloaded the extension yet)."
    echo "API_SERVER_CORS_ORIGINS=chrome-extension://wfmbaupgoypxvwvi,chrome-extension://facoonfglfknhjgmamebhpdnejfaelji"
  } >> "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$file"
}

if [[ "$DEFAULT_ENV_FILE" == "$ENV_FILE" ]]; then
  write_managed_entries "$ENV_FILE"
  echo "Ensured API server settings in: $ENV_FILE"
else
  write_managed_entries "$ENV_FILE"
  write_managed_entries "$DEFAULT_ENV_FILE"
  echo "Ensured API server settings in: $ENV_FILE and $DEFAULT_ENV_FILE"
fi
echo "(default profile owns the shared listener on multiplexed installs)"

# Verification: the gateway may need a restart before the listener accepts
# connections. Probe with the key; if nothing answers, print the restart hint.
echo ""
echo "Verifying http://127.0.0.1:8642/v1/models with the key..."
for i in 1 2 3; do
  RESP="$(curl -s -m 2 -H "Authorization: Bearer $API_KEY" http://127.0.0.1:8642/v1/models || true)"
  if [[ "$RESP" == *'"data"'* ]]; then
    echo "Connected. Models: $RESP"
    echo ""
    echo "Done. Put this API key in the extension's Options → API key:"
    echo "  $API_KEY"
    exit 0
  fi
  if [[ -n "$RESP" ]]; then
    echo "Server answered but /v1/models did not look as expected: $RESP" >&2
  fi
  [[ $i -lt 3 ]] && sleep 1
done

echo "The API server is not answering yet. Restart the gateway, then re-run this script:" >&2
echo "  hermes -p default gateway restart    # multiplexed host (recommended)" >&2
echo "  hermes -p $PROFILE gateway           # single-profile installs" >&2
echo "" >&2
echo "API key (already written to your .env files) — put it in Options → API key:" >&2
echo "  $API_KEY" >&2
exit 1
