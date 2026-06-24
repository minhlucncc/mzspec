#!/usr/bin/env bash
# Starter gate (reference): run an arbitrary command as a gate, demonstrating the
# exit-code / stderr convention. Useful for wrapping a one-off check via customGates.
# Usage: bash toolchain-passthrough.sh <label> -- <command> [args...]
#   e.g. bash toolchain-passthrough.sh smoke -- node scripts/smoke.js
set -euo pipefail

label="${1:-gate}"
shift || true
if [ "${1:-}" = "--" ]; then shift; fi
if [ "$#" -eq 0 ]; then
  echo "fail: $label — no command given (usage: ... <label> -- <command> [args...])" >&2
  exit 2
fi

# cwd is the repo root per the gate contract; run the command as-is.
if "$@"; then
  echo "ok: $label"
else
  rc=$?
  echo "fail: $label (exit $rc): $*" >&2
  exit "$rc"
fi
