#!/usr/bin/env bash
set -euo pipefail

checkout=${1:?usage: assert-checkout-idle.sh <checkout> [port]}
port=${2:-13773}

if [[ ! $port =~ ^[0-9]+$ ]] || ((port < 1 || port > 65535)); then
  printf 'Invalid port: %s\n' "$port" >&2
  exit 64
fi

checkout=$(realpath -m -- "$checkout")
mapfile -t pids < <(
  ss -H -ltnp "( sport = :${port} )" 2>/dev/null |
    grep -oE 'pid=[0-9]+' |
    cut -d= -f2 |
    sort -u
)

for pid in "${pids[@]}"; do
  cwd=$(readlink -f "/proc/${pid}/cwd" 2>/dev/null || true)
  if [[ $cwd == "$checkout" || $cwd == "$checkout/"* ]]; then
    printf 'ACTIVE_CHECKOUT pid=%s port=%s cwd=%s\n' "$pid" "$port" "$cwd" >&2
    exit 73
  fi
done

printf 'IDLE_CHECKOUT port=%s checkout=%s\n' "$port" "$checkout"
