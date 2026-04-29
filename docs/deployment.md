# ScoutD3 Deployment Guide

This guide documents the current deployment story for ScoutD3.

## Supported Production Paths

ScoutD3 currently supports two practical deployment approaches:

1. Render, using the checked-in blueprint in `render.yaml`
2. A VPS deployment using `docker-compose.prod.yml`, Nginx, and the scripts in `scripts/`

## Render Deployment

Render is the fastest path to a public deployment for the current repository.

### What Render Creates

The blueprint in `render.yaml` defines:

- a PostgreSQL database
- a Python web service for the backend
- a static site for the frontend

### Backend Render Settings

The current backend service configuration uses:

- build command: `pip install -r requirements.txt`
- pre-deploy command: `alembic upgrade head`
- start command: `uvicorn main_simple:app --host 0.0.0.0 --port $PORT`
- health check path: `/api/v1/health`

### Frontend Render Settings

The current frontend service configuration uses:

- build command: `npm install && npm run build`
- publish path: `dist`
- `VITE_API_URL` pointing to the backend Render URL

### Render Deployment Steps

1. Push the repository to GitHub.
2. Create a new Render Blueprint deployment from the repo.
3. Let Render provision the database and both services.
4. After the first deploy, verify `CORS_ORIGINS` on the backend if you attach a custom frontend domain.
5. Test `/docs`, `/api/v1/health`, and the frontend dashboard after deployment.

## VPS Deployment

Use the VPS path if you want the frontend and backend under one public domain with Nginx routing requests to the correct service.

### Main Files

- `docker-compose.prod.yml`
- `nginx/nginx.conf`
- `scripts/deploy.sh`
- `scripts/update.sh`
- `scripts/backup.sh`

### VPS Deployment Steps

1. Provision a Linux VPS.
2. Install Docker Engine and Docker Compose.
3. Clone the repository.
4. Copy `.env.prod.template` to `.env.prod` and fill in real values.
5. Point your domain at the VPS.
6. Run the deploy script.

## Database Requirements

The current backend expects PostgreSQL and Alembic migrations.

Before first start against a new database:

```bash
cd backend
alembic upgrade head
```

## Post-Deploy Checks

After any deployment, verify:

- backend health endpoint returns success
- frontend can load stats and scrape status without CORS issues
- the dashboard renders
- the ingestion summary endpoint returns expected fields
- dark mode and accessibility controls still work in production

## Always-On Availability

If you want the site available all the time:

- choose Render or a VPS rather than local-only hosting
- use a paid or non-sleeping tier for the backend if you need immediate responsiveness
- attach a custom domain if the site is meant for external users