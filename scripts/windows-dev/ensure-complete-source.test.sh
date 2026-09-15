#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
guard="$script_dir/ensure-complete-source.sh"
temp_root=$(mktemp -d)
trap 'rm -rf -- "$temp_root"' EXIT

export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com
export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com

# A complete origin that permits filtered clones and fetch-by-id, like GitHub does.
git init -q -b main "$temp_root/origin"
git -C "$temp_root/origin" config uploadpack.allowFilter true
git -C "$temp_root/origin" config uploadpack.allowAnySHA1InWant true
# Rewrite one file per commit so historic blob versions live only in history, which a
# blob:none clone with a checkout never fetches.
for n in 1 2 3; do
  printf 'content %s\n' "$n" >"$temp_root/origin/file.txt"
  git -C "$temp_root/origin" add . && git -C "$temp_root/origin" commit -qm "commit $n"
done

missing_count() {
  git -C "$1" rev-list --objects --missing=print --all | grep -c '^?' || true
}

# Positive control: a partial clone reproduces the upload-pack failure before healing.
git clone -q --filter=blob:none "file://$temp_root/origin" "$temp_root/partial"
[[ $(missing_count "$temp_root/partial") -gt 0 ]]
git init -q --bare "$temp_root/consumer"
set +e
git -C "$temp_root/consumer" fetch -q "$temp_root/partial" +refs/heads/main:refs/remotes/src/main 2>/dev/null
before_status=$?
set -e
[[ $before_status -ne 0 ]]

"$guard" "$temp_root/partial" >/dev/null 2>&1
[[ $(missing_count "$temp_root/partial") -eq 0 ]]
[[ -z $(git -C "$temp_root/partial" config --get-regexp 'promisor|partialclone' || true) ]]
git -C "$temp_root/consumer" fetch -q "$temp_root/partial" +refs/heads/main:refs/remotes/src/main
[[ $(git -C "$temp_root/consumer" rev-parse refs/remotes/src/main) == $(git -C "$temp_root/origin" rev-parse main) ]]

# Already-complete checkout is a no-op that still exits 0.
"$guard" "$temp_root/partial" >/dev/null

# Negative: no remote can serve the objects, so the guard fails closed and keeps the config.
git clone -q --filter=blob:none "file://$temp_root/origin" "$temp_root/orphan"
git -C "$temp_root/orphan" remote set-url origin "$temp_root/does-not-exist"
set +e
"$guard" "$temp_root/orphan" >/dev/null 2>&1
orphan_status=$?
set -e
[[ $orphan_status -eq 74 ]]
[[ -n $(git -C "$temp_root/orphan" config --get-regexp 'promisor' || true) ]]

printf 'complete-source guard self-test passed\n'
