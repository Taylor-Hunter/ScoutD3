#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Starting ScoutD3 local development environment..."
bash "$SCRIPT_DIR/scripts/run-local.sh"