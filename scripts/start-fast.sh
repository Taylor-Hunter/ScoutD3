#!/usr/bin/env bash
# Fast restart for ScoutD3 on macOS / Linux.
# Skips dependency install and database migrations.
# Use scripts/run-local.sh instead when dependencies change
# or a new Alembic migration has been added.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
FRONTEND_DIR="$REPO_ROOT/frontend"
VENV_DIR="$BACKEND_DIR/.venv"
ACTIVATE="$VENV_DIR/bin/activate"

red()    { printf "\033[31m%s\033[0m\n" "$1"; }
yellow() { printf "\033[33m%s\033[0m\n" "$1"; }
green()  { printf "\033[32m%s\033[0m\n" "$1"; }

if [ ! -f "$ACTIVATE" ]; then
  red "Virtual environment not found at $VENV_DIR."
  yellow "Run 'scripts/run-local.sh' first to install dependencies."
  exit 1
fi

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  red "Frontend node_modules not found."
  yellow "Run 'scripts/run-local.sh' first to install dependencies."
  exit 1
fi

cleanup() {
  if [ -n "${BACKEND_PID:-}" ] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

echo "Starting backend..."
(
  cd "$BACKEND_DIR"
  # shellcheck disable=SC1090
  source "$ACTIVATE"
  uvicorn main_simple:app --reload --host 0.0.0.0 --port 8000
) &
BACKEND_PID=$!

green "ScoutD3 is starting (fast mode - skipped install and migrations)."
echo "Frontend: http://127.0.0.1:5173"
echo "Backend:  http://127.0.0.1:8000/api/v1"
echo "Docs:     http://127.0.0.1:8000/docs"

echo "Starting frontend..."
(cd "$FRONTEND_DIR" && npm run dev)
