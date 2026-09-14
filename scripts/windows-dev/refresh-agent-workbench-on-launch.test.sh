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
mkdir -p "$home/.local/bin" "$source_root/bin" "$home/.config/agent-workbench" "$home/.local/state/agent-workbench"
cat >"$source_root/bin/agent-workbench.js" <<'JS'
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALL_LOG, `${args.join(' ')}\n`);
if (args[0] === 'refresh' && process.env.FAIL_REFRESH === '1') process.exit(42);
process.stdout.write('{}\n');
JS
cat >"$home/.local/bin/agent-workbench" <<'SH'
#!/usr/bin/env bash
printf 'doctor\n' >>"$CALL_LOG"
if [[ ${FAIL_DOCTOR:-} == 1 ]]; then
  exit 43
fi
printf '{"ok":true,"snapshotId":"fixture-snapshot"}\n'
SH
chmod +x "$home/.local/bin/agent-workbench"

run_helper() {
  HOME="$home" NODE_BINARY="$(command -v node)" CALL_LOG="$temp_root/calls" "$helper" "$source_root" 0 "$@" >/dev/null
}

printf 'version: 3\n' >"$home/.config/agent-workbench/workspace.yaml"
run_helper
[[ $(head -n1 "$temp_root/calls") == 'refresh' ]]
[[ $(grep -c '^doctor$' "$temp_root/calls") -eq 1 ]]

>"$temp_root/calls"
printf 'version: 3\n' >"$home/.config/agent-workbench/workspace.yaml"
bash -c 'exec -a agent-workbench-fixture sleep 30' &
runtime_pid=$!
printf '{"pid":%s}\n' "$runtime_pid" >"$home/.local/state/agent-workbench/runtime.json"
set +e
run_helper >/dev/null 2>&1
blocked_status=$?
set -e
[[ $blocked_status -eq 75 ]]
kill -0 "$runtime_pid"
[[ ! -s "$temp_root/calls" ]]
kill "$runtime_pid"
wait "$runtime_pid" 2>/dev/null || true
runtime_pid=''

>"$temp_root/calls"
set +e
FAIL_REFRESH=1 HOME="$home" NODE_BINARY="$(command -v node)" CALL_LOG="$temp_root/calls" "$helper" "$source_root" 0 >/dev/null 2>&1
refresh_status=$?
set -e
[[ $refresh_status -eq 42 ]]
grep -q '^refresh$' "$temp_root/calls"
! grep -q '^doctor$' "$temp_root/calls"

>"$temp_root/calls"
set +e
FAIL_DOCTOR=1 HOME="$home" NODE_BINARY="$(command -v node)" CALL_LOG="$temp_root/calls" "$helper" "$source_root" 0 >/dev/null 2>&1
doctor_status=$?
set -e
[[ $doctor_status -eq 43 ]]
[[ $(head -n1 "$temp_root/calls") == 'refresh' ]]
[[ $(grep -c '^doctor$' "$temp_root/calls") -eq 1 ]]

printf 'Agent Workbench launch refresh self-test passed\n'
