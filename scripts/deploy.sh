#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.prod.yml"

if [ ! -f "$ROOT_DIR/.env.prod" ]; then
    echo "Missing .env.prod. Copy .env.prod.template and fill in your production values first."
    exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is required on the VPS before deploying ScoutD3."
    exit 1
fi

cd "$ROOT_DIR"

echo "Building and starting the production stack..."
docker compose --env-file .env.prod -f "$COMPOSE_FILE" up -d --build

echo "Running database migrations..."
docker compose --env-file .env.prod -f "$COMPOSE_FILE" exec -T backend alembic upgrade head

echo "Deployment finished."
echo "ScoutD3 is now available through the VPS on port 80."
echo "Point your domain's A record at this server and set CORS_ORIGINS in .env.prod to that public domain."