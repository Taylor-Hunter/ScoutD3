# ScoutD3

ScoutD3 is an NCAA Division III scouting application with a FastAPI backend, a React + Vite frontend, and a PostgreSQL data store. The current application focuses on collecting publicly available team data, showing users the status of that collection, and presenting the results through an accessible web interface.

**Live demo:** <https://scoutd3-frontend.onrender.com>

## Current Stack

- Backend: FastAPI, SQLAlchemy, Alembic, PostgreSQL
- Frontend: React 18, TypeScript, Vite, React Router, React Query, Tailwind CSS
- Deployment: Render blueprint or VPS with Docker Compose and Nginx

## Current Product Highlights

- Startup sample-first loading so the app can show a small dataset quickly
- Background full-data ingestion with visible progress and status messaging
- Dashboard and ingestion pages that expose scrape phase, percent complete, and current run type
- Accessibility controls with dark mode, high contrast, reduced motion, larger text, focus enhancements, and screen-reader announcements
- Same-host local API resolution to avoid common `localhost` versus `127.0.0.1` CORS problems during development

## Repository Layout

```text
ScoutD3/
├── backend/                  # FastAPI app, scraper, database models, Alembic
├── frontend/                 # React + Vite client
├── docs/                     # Developer, API, deployment, and accessibility docs
├── nginx/                    # Nginx config for VPS deployment
├── scripts/                  # Deploy, update, and maintenance scripts
├── docker-compose.prod.yml   # VPS production stack
├── render.yaml               # Render blueprint
└── README.md
```

## Local Development

### One-Command Start (Recommended)

From the repository root:

```powershell
scripts\run-local.cmd
```

This command will:

- create `backend/.venv` if needed
- copy `backend/.env.example` to `backend/.env` if missing
- install backend and frontend dependencies on first run
- apply Alembic migrations
- launch backend and frontend

Alternative commands:

- Windows PowerShell: `powershell -ExecutionPolicy Bypass -File scripts/run-local.ps1`
- macOS/Linux: `bash scripts/run-local.sh`

### Fast Restart (After First Setup)

If you have already run `run-local.cmd` once on this machine and the
virtual environment and `node_modules` are present, you can skip the
install and migration steps and bring the stack up in a couple of
seconds with:

```powershell
scripts\start-fast.cmd
```

This script verifies that `backend/.venv` and `frontend/node_modules`
exist, then launches the backend (uvicorn on port 8000) and the
frontend (Vite on port 5173) in two new terminal windows. It does
**not** install dependencies or run migrations, so use it only for
day-to-day startup. Run `run-local.cmd` again whenever dependencies
change or a new database migration is added.

The macOS and Linux equivalent is `scripts/start-fast.sh`:

```bash
chmod +x scripts/start-fast.sh   # first time only
./scripts/start-fast.sh
```

It performs the same checks against `backend/.venv` and
`frontend/node_modules`, starts the backend in the background, and
runs the frontend in the foreground. Use `scripts/run-local.sh`
when dependencies or migrations change.

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 14+

### 1. Backend setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Update `.env` with a valid local PostgreSQL connection string, then run migrations:

```bash
alembic upgrade head
```

Start the API:

```bash
uvicorn main_simple:app --reload --host 0.0.0.0 --port 8000
```

### 2. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server typically runs on `http://127.0.0.1:5173` or `http://localhost:5173`.

### 3. Local URLs

- Frontend: `http://127.0.0.1:5173`
- Backend API: `http://127.0.0.1:8000/api/v1`
- Swagger UI: `http://127.0.0.1:8000/docs`

## Data Loading Behavior

On first startup, ScoutD3 is designed to avoid the appearance of an empty app:

1. The backend attempts an initial sample load so the UI has data to display quickly.
2. A background full scrape continues after the sample is ready.
3. The frontend surfaces the current load mode, scrape phase, and progress percent on the dashboard and ingestion screens.

This makes it easier for users to understand whether data is still loading, refreshing, or ready.

## Accessibility And Theming

The current frontend includes a working accessibility settings panel with:

- Dark mode
- High contrast mode
- Reduced motion
- Larger text scaling
- Enhanced keyboard navigation and focus states
- Screen-reader support with live announcements

These settings are persisted in local storage and applied to the document root.

## Deployment

ScoutD3 is currently deployed on Render's free tier at
<https://scoutd3-frontend.onrender.com> using the [`render.yaml`](render.yaml)
blueprint, which provisions three services:

- a managed PostgreSQL database,
- a Python web service running the FastAPI backend (`scoutd3-backend`),
- a static site that serves the production Vite build of the frontend (`scoutd3-frontend`).

The Python runtime is pinned to 3.11 via a tracked
[`backend/.python-version`](backend/.python-version) file so that all
dependencies install from prebuilt wheels rather than compiling native
code in the build container, and [`backend/requirements.txt`](backend/requirements.txt)
has been trimmed to only the libraries imported at runtime so free-tier
builds finish well within their time budget.

A self-hosted alternative is also supported for environments that prefer
a single origin: see [`docker-compose.prod.yml`](docker-compose.prod.yml)
and [`docs/deployment.md`](docs/deployment.md). In that setup, Nginx
serves the frontend and proxies the API on a unified origin, so there is
no `localhost` versus `127.0.0.1` CORS friction.

## Mobile and Responsive Layout

The frontend is responsive and intended to be usable on phones and
tablets as well as desktops. Below the `md` Tailwind breakpoint the top
navigation collapses into a hamburger toggle that opens a stacked
drawer, the header hides its secondary tagline so sign-in controls stay
reachable, and wide tables scroll inside their own container instead of
pushing the page sideways. At tablet width and above, the full
horizontal navigation and original data-dense layout are restored.

## Additional Documentation

- `docs/developer-guide.md`
- `docs/api.md`
- `docs/accessibility.md`
- `docs/deployment.md`

## Status

This doc set has been updated to match the current codebase structure and current app behavior. If backend routes, deployment config, or accessibility controls change again, update the docs in the same branch as the feature work.