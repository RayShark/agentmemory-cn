#!/usr/bin/env bash

set +e

SCRIPT_NAME="${1:-}"
if [ -z "$SCRIPT_NAME" ]; then
  exit 0
fi
shift || true

if [ -f "$HOME/.agentmemory/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$HOME/.agentmemory/.env" >/dev/null 2>&1 || true
  set +a
fi

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [ -z "$PLUGIN_ROOT" ]; then
  PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd -P 2>/dev/null)"
fi

SCRIPT_PATH="$PLUGIN_ROOT/scripts/$SCRIPT_NAME"
if [ ! -f "$SCRIPT_PATH" ]; then
  exit 0
fi

NODE_BIN="${AGENTMEMORY_NODE:-}"
if [ -z "$NODE_BIN" ]; then
  NODE_BIN="$(command -v node 2>/dev/null || true)"
fi
if [ -z "$NODE_BIN" ] && [ -x "$HOME/.nvm/versions/node/v20.20.2/bin/node" ]; then
  NODE_BIN="$HOME/.nvm/versions/node/v20.20.2/bin/node"
fi
if [ -z "$NODE_BIN" ]; then
  exit 0
fi

LOG_PATH="${AGENTMEMORY_HOOK_LOG:-$HOME/.agentmemory/hook-errors.log}"
mkdir -p "$(dirname "$LOG_PATH")" >/dev/null 2>&1 || true

"$NODE_BIN" "$SCRIPT_PATH" "$@" 2>>"$LOG_PATH"
STATUS=$?
if [ "$STATUS" -ne 0 ]; then
  printf '[%s] %s exited %s\n' "$(date -Is 2>/dev/null || date)" "$SCRIPT_NAME" "$STATUS" >>"$LOG_PATH" 2>/dev/null || true
fi

exit 0
