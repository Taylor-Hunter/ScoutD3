# ScoutD3 Developer Guide

This guide describes the current development workflow and code layout for ScoutD3.

## Current Stack

### Backend

- FastAPI
- SQLAlchemy
- Alembic
- PostgreSQL
- Python 3.11+

### Frontend

- React 18
- TypeScript
- Vite
- React Router
- React Query
- Tailwind CSS

## Current Repository Layout

```text
ScoutD3/
├── backend/
│   ├── alembic/
│   ├── app/
│   ├── main_simple.py
│   ├── ncaa_scraper.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
├── docs/
├── nginx/
├── scripts/
├── docker-compose.prod.yml
└── render.yaml
```

## Local Development

### Fastest Local Startup

From repo root, use one command:

- Windows: `scripts\run-local.cmd`
- Windows PowerShell: `powershell -ExecutionPolicy Bypass -File scripts/run-local.ps1`
- macOS/Linux: `bash scripts/run-local.sh`

These scripts handle first-run setup and then start both services.

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
alembic upgrade head
uvicorn main_simple:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Local URLs

- Frontend: `http://127.0.0.1:5173`
- Backend API root: `http://127.0.0.1:8000/api/v1`
- Swagger UI: `http://127.0.0.1:8000/docs`

## Current Backend Notes

- The current production and development entrypoint used in deployment is `main_simple:app`.
- Scrape lifecycle and progress metadata are coordinated through `main_simple.py` and `ncaa_scraper.py`.
- Alembic migrations should be applied before starting the backend against a fresh database.

## Current Frontend Notes

- Vite is the active frontend toolchain.
- The API service resolves the backend base URL in a way that reduces local `localhost` and `127.0.0.1` mismatches.
- Accessibility settings are persisted in local storage and applied to the document root through CSS classes and attributes.

## When You Touch Data Loading

If you change ingestion behavior, also verify:

- scrape status endpoint output
- ingestion summary endpoint output
- dashboard load state
- app readiness banner behavior
- ingestion page progress text and progress bar

## When You Touch Accessibility Or Theming

If you change accessibility settings, also verify:

- dark mode on the homepage and interior pages
- high contrast strength
- reduced motion behavior
- keyboard-only access to the settings panel
- focus visibility
- persistence across reloads

## Suggested Validation Commands

### Frontend

```bash
cd frontend
npm run type-check
npm run lint
```

### Backend

```bash
cd backend
pytest
```

If the repo contains legacy docs or architecture notes that no longer match runtime behavior, update them in the same branch as the code change.