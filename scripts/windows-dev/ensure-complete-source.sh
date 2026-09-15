#!/usr/bin/env bash
# Makes a Git checkout able to serve upload-pack to another machine.
#
# A partial clone (any remote with `promisor = true` / `partialclonefilter`) holds commits and
# trees but lazily fetches blobs. upload-pack refuses to lazy-fetch while serving, so a fetch
# from such a checkout fails with "possible repository corruption on the remote side". This
# script backfills every missing object by ID from each remote and then removes the partial-clone
# configuration, so the class of failure cannot recur from this checkout.
#
# Exit codes: 0 complete · 64 usage · 74 objects still missing after every remote was tried.
set -euo pipefail

repo=${1:?usage: ensure-complete-source.sh <checkout>}
repo=$(realpath -m -- "$repo")
git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || {
  printf 'Not a Git checkout: %s\n' "$repo" >&2
  exit 64
}

partial_config() {
  git -C "$repo" config --get-regexp '^(remote\..*\.(promisor|partialclonefilter)|extensions\.partialclone)$' 2>/dev/null || true
}

count_missing() {
  git -C "$repo" rev-list --objects --missing=print --all HEAD 2>/dev/null | grep -c '^?' || true
}

list_missing() {
  git -C "$repo" rev-list --objects --missing=print --all HEAD 2>/dev/null | grep '^?' | cut -c2-
}

if [[ -z $(partial_config) ]] && (( $(count_missing) == 0 )); then
  printf 'COMPLETE_SOURCE checkout=%s\n' "$repo"
  exit 0
fi

missing_before=$(count_missing)
printf 'PARTIAL_SOURCE checkout=%s missing=%s; backfilling\n' "$repo" "$missing_before" >&2

# Stale remote-tracking refs can point at objects the remote no longer serves.
for remote in $(git -C "$repo" remote); do
  git -C "$repo" remote prune "$remote" >/dev/null 2>&1 || true
done

# Fetch by object ID. Plain negotiation reports every local commit as "have", and the server then
# omits exactly the blobs being requested; the noop algorithm is what Git's own lazy fetch uses.
for remote in $(git -C "$repo" remote); do
  (( $(count_missing) == 0 )) && break
  list_missing | git -C "$repo" -c fetch.negotiationAlgorithm=noop fetch \
    --no-tags --no-write-fetch-head --recurse-submodules=no --stdin "$remote" >/dev/null 2>&1 || true
done

missing=$(count_missing)
if (( missing > 0 )); then
  printf 'INCOMPLETE_SOURCE checkout=%s missing=%s after trying every remote\n' "$repo" "$missing" >&2
  exit 74
fi

for remote in $(git -C "$repo" remote); do
  git -C "$repo" config --unset "remote.$remote.promisor" 2>/dev/null || true
  git -C "$repo" config --unset "remote.$remote.partialclonefilter" 2>/dev/null || true
done
git -C "$repo" config --unset extensions.partialclone 2>/dev/null || true

printf 'COMPLETE_SOURCE checkout=%s backfilled=%s\n' "$repo" "$missing_before"
