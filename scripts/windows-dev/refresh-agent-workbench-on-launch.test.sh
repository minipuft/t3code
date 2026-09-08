#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
helper="$script_dir/refresh-agent-workbench-on-launch.sh"
temp_root=$(mktemp -d)
runtime_pid=''

cleanup() {
  if [[ -n $runtime_pid ]]; then
    kill "$runtime_pid" 2>/dev/null || true
    wait "$runtime_pid" 2>/dev/null || true
  fi
  rm -rf -- "$temp_root"
}
trap cleanup EXIT

home="$temp_root/home"
source_root="$temp_root/source"
mkdir -p "$home/.local/bin" "$source_root/bin"
cat >"$source_root/bin/agent-workbench.js" <<'JS'
const fs = require('node:fs');
fs.appendFileSync(process.env.CALL_LOG, `${process.argv[2]}\n`);
process.stdout.write('{}\n');
JS
cat >"$home/.local/bin/agent-workbench" <<'SH'
#!/usr/bin/env bash
printf '{"ok":true,"snapshotId":"fixture-snapshot"}\n'
SH
chmod +x "$home/.local/bin/agent-workbench"

HOME="$home" NODE_BINARY="$(command -v node)" CALL_LOG="$temp_root/calls" "$helper" "$source_root" 0 >/dev/null
[[ $(<"$temp_root/calls") == 'refresh' ]]

mkdir -p "$home/.local/state/agent-workbench"
bash -c 'exec -a agent-workbench-fixture sleep 30' &
runtime_pid=$!
printf '{"pid":%s}\n' "$runtime_pid" >"$home/.local/state/agent-workbench/runtime.json"
set +e
HOME="$home" NODE_BINARY="$(command -v node)" CALL_LOG="$temp_root/calls" "$helper" "$source_root" 0 >/dev/null 2>&1
blocked_status=$?
set -e
[[ $blocked_status -eq 75 ]]
kill -0 "$runtime_pid"

printf 'Agent Workbench launch refresh self-test passed\n'
