#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
FRONTEND_DIR="$REPO_ROOT/frontend"
VENV_DIR="$BACKEND_DIR/.venv"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required but was not found in PATH."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but was not found in PATH."
  exit 1
fi

if [ ! -d "$VENV_DIR" ]; then
  echo "Creating backend virtual environment..."
  (cd "$BACKEND_DIR" && python3 -m venv .venv)
fi

if [ ! -f "$BACKEND_DIR/.env" ] && [ -f "$BACKEND_DIR/.env.example" ]; then
  echo "Creating backend .env from .env.example..."
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
fi

echo "Preparing backend dependencies..."
(
  cd "$BACKEND_DIR"
  source .venv/bin/activate
  if [ ! -f ".venv/.deps_installed" ]; then
    pip install -r requirements.txt
    touch .venv/.deps_installed
  fi
  echo "Applying database migrations..."
  alembic upgrade head
)

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "Preparing frontend dependencies..."
  (cd "$FRONTEND_DIR" && npm install)
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
  source .venv/bin/activate
  uvicorn main_simple:app --reload --host 0.0.0.0 --port 8000
) &
BACKEND_PID=$!

echo "Starting frontend..."
echo "Frontend: http://127.0.0.1:5173"
echo "Backend:  http://127.0.0.1:8000/api/v1"
echo "Docs:     http://127.0.0.1:8000/docs"
(cd "$FRONTEND_DIR" && npm run dev)
