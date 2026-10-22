#!/usr/bin/env bash
# Usage: ./setup.sh <candidate-token> [--force]
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v bun >/dev/null 2>&1; then
  echo "Bun is required. Install it from https://bun.sh and re-run ./setup.sh." >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1 || ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Run setup from inside your private clone of this repo." >&2
  exit 1
fi

exec bun scripts/setup.ts "$@"
