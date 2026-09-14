#!/usr/bin/env bash
set -euo pipefail
umask 077

source_root=${1:?usage: refresh-agent-workbench-on-launch.sh <agent-workbench-source> [wait-seconds]}
wait_seconds=${2:-20}
runtime_file=${AGENT_WORKBENCH_RUNTIME_FILE:-"$HOME/.local/state/agent-workbench/runtime.json"}
workspace_file=${AGENT_WORKBENCH_WORKSPACE_FILE:-"$HOME/.config/agent-workbench/workspace.yaml"}
node_binary=${NODE_BINARY:-}

if [[ -z $node_binary && -x $HOME/.local/bin/agent-workbench ]]; then
  node_binary=$(
    "$HOME/.local/bin/agent-workbench" doctor |
      python3 -c 'import json, sys; value=json.load(sys.stdin); print(value.get("node", ""))'
  )
fi
if [[ -z $node_binary ]]; then
  node_binary=$(command -v node || true)
fi

if [[ ! $wait_seconds =~ ^[0-9]+$ ]]; then
  printf 'Invalid Agent Workbench wait: %s\n' "$wait_seconds" >&2
  exit 64
fi
if [[ ! -f $source_root/bin/agent-workbench.js ]]; then
  printf 'Agent Workbench source is unavailable: %s\n' "$source_root" >&2
  exit 66
fi
if [[ -z $node_binary || $node_binary == *.exe || ! -x $node_binary ]]; then
  printf 'Agent Workbench refresh requires a Linux Node executable; received: %s\n' "$node_binary" >&2
  exit 69
fi

deadline=$((SECONDS + wait_seconds))
while [[ -f $runtime_file ]]; do
  runtime_pid=$(
    "$node_binary" -e '
      const fs = require("node:fs");
      const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      if (!Number.isSafeInteger(value.pid) || value.pid < 1) process.exit(1);
      process.stdout.write(String(value.pid));
    ' "$runtime_file"
  ) || {
    printf 'Agent Workbench runtime descriptor is invalid: %s\n' "$runtime_file" >&2
    exit 74
  }
  if [[ ! -d /proc/$runtime_pid ]] || ! tr '\0' ' ' <"/proc/$runtime_pid/cmdline" 2>/dev/null | grep -q 'agent-workbench'; then
    break
  fi
  if ((SECONDS >= deadline)); then
    printf 'ACTIVE_AGENT_WORKBENCH pid=%s descriptor=%s\n' "$runtime_pid" "$runtime_file" >&2
    exit 75
  fi
  sleep 0.25
done

if [[ ! -f $workspace_file ]]; then
  printf 'Agent Workbench workspace configuration is unavailable: %s\n' "$workspace_file" >&2
  exit 68
fi

"$node_binary" "$source_root/bin/agent-workbench.js" refresh

doctor_json=$("$HOME/.local/bin/agent-workbench" doctor)
"$node_binary" -e '
  const fs = require("node:fs");
  const value = JSON.parse(fs.readFileSync(0, "utf8"));
  if (value.ok !== true) process.exit(1);
  process.stdout.write(`Agent Workbench ready: ${value.snapshotId}\n`);
' <<<"$doctor_json"
