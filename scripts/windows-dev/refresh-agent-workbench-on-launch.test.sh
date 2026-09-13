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
if (args[0] === 'workspace' && args[1] === 'migrate-v3' && process.env.FAIL_MIGRATE === '1') process.exit(42);
if (args[0] === 'workspace' && args[1] === 'migrate-v3') {
  const receipt = args[args.indexOf('--receipt') + 1];
  fs.writeFileSync(receipt, '{"ok":true}\n');
}
process.stdout.write('{}\n');
JS
cat >"$home/.local/bin/agent-workbench" <<'SH'
#!/usr/bin/env bash
printf 'doctor\n' >>"$CALL_LOG"
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

for version in 1 2; do
  >"$temp_root/calls"
  printf 'version: %s\n' "$version" >"$home/.config/agent-workbench/workspace.yaml"
  if [[ $version -eq 1 ]]; then
    migration_output=$(HOME="$home" NODE_BINARY="$(command -v node)" CALL_LOG="$temp_root/calls" "$helper" "$source_root" 0)
  else
    run_helper
  fi
  grep -q '^workspace migrate-v3 --receipt ' "$temp_root/calls"
  [[ $(grep -c '^doctor$' "$temp_root/calls") -eq 1 ]]
  receipt_path=$(sed -n 's/^workspace migrate-v3 --receipt //p' "$temp_root/calls")
  [[ -s $receipt_path ]]
  [[ $(stat -c '%a' "$(dirname "$receipt_path")") == 700 ]]
  if [[ $version -eq 1 ]]; then
    [[ $migration_output == *"Agent Workbench migration receipt: $receipt_path"* ]]
  fi
done

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
printf 'version: 1\n' >"$home/.config/agent-workbench/workspace.yaml"
set +e
FAIL_MIGRATE=1 HOME="$home" NODE_BINARY="$(command -v node)" CALL_LOG="$temp_root/calls" "$helper" "$source_root" 0 >/dev/null 2>&1
migration_status=$?
set -e
[[ $migration_status -eq 42 ]]
grep -q '^workspace migrate-v3 --receipt ' "$temp_root/calls"
! grep -q '^refresh$' "$temp_root/calls"
! grep -q '^doctor$' "$temp_root/calls"

printf 'Agent Workbench launch refresh self-test passed\n'
