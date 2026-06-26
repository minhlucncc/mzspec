#!/usr/bin/env bash
# Starter gate: validate an OpenSpec change strictly.
# Usage: bash openspec-validate.sh <change-name>
# Exit 0 = valid, non-zero = invalid (the gate contract).
set -euo pipefail

change="${1:-}"
if [ -z "$change" ]; then
  echo "fail: openspec-validate requires a <change-name> argument" >&2
  exit 2
fi

if ! command -v openspec >/dev/null 2>&1; then
  echo "fail: openspec CLI not found on PATH (npm i -g @fission-ai/openspec)" >&2
  exit 2
fi

if openspec validate "$change" --strict; then
  echo "ok: openspec validate $change --strict"
else
  echo "fail: openspec validate $change --strict" >&2
  exit 1
fi
