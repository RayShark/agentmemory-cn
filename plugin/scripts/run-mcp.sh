#!/usr/bin/env bash

set -e

if [ -f "$HOME/.agentmemory/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$HOME/.agentmemory/.env" >/dev/null 2>&1 || true
  set +a
fi

export AGENTMEMORY_URL="${AGENTMEMORY_URL:-http://localhost:3111}"
export AGENTMEMORY_TOOLS="${AGENTMEMORY_TOOLS:-all}"
export AGENTMEMORY_SECRET="${AGENTMEMORY_SECRET:-}"

if [ -x "$HOME/.local/bin/agentmemory-mcp-codex" ]; then
  exec "$HOME/.local/bin/agentmemory-mcp-codex"
fi

NODE_BIN="${AGENTMEMORY_NODE:-}"
if [ -z "$NODE_BIN" ]; then
  NODE_BIN="$(command -v node 2>/dev/null || true)"
fi
if [ -z "$NODE_BIN" ] && [ -x "$HOME/.nvm/versions/node/v20.20.2/bin/node" ]; then
  NODE_BIN="$HOME/.nvm/versions/node/v20.20.2/bin/node"
fi

STANDALONE="$HOME/.nvm/versions/node/v20.20.2/lib/node_modules/@agentmemory/agentmemory/dist/standalone.mjs"
if [ -n "$NODE_BIN" ] && [ -f "$STANDALONE" ]; then
  export AGENTMEMORY_FORCE_PROXY="${AGENTMEMORY_FORCE_PROXY:-1}"
  exec "$NODE_BIN" "$STANDALONE"
fi

exec npx -y @agentmemory/mcp
