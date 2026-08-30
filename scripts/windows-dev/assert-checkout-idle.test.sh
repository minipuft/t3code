#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
guard="$script_dir/assert-checkout-idle.sh"
temp_root=$(mktemp -d)
listener_pid=''

cleanup() {
  if [[ -n $listener_pid ]]; then
    kill "$listener_pid" 2>/dev/null || true
    wait "$listener_pid" 2>/dev/null || true
  fi
  rm -rf -- "$temp_root"
}
trap cleanup EXIT

mkdir -p "$temp_root/active" "$temp_root/idle"
(
  cd "$temp_root/active"
  exec python3 - "$temp_root/port" <<'PY'
import socket
import sys
import time

server = socket.socket()
server.bind(("127.0.0.1", 0))
server.listen()
with open(sys.argv[1], "w", encoding="utf-8") as handle:
    handle.write(str(server.getsockname()[1]))
while True:
    time.sleep(1)
PY
) &
listener_pid=$!

for _ in {1..100}; do
  [[ -s $temp_root/port ]] && break
  sleep 0.01
done
port=$(<"$temp_root/port")

set +e
"$guard" "$temp_root/active" "$port" >/dev/null 2>&1
blocked_status=$?
set -e
[[ $blocked_status -eq 73 ]]
"$guard" "$temp_root/idle" "$port" >/dev/null

printf 'checkout-idle guard self-test passed\n'
