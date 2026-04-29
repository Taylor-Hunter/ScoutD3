# ScoutD3 API Guide

This guide summarizes the current API usage patterns for the checked-in ScoutD3 application.

## Base URLs

- local API root: `http://127.0.0.1:8000/api/v1`
- local Swagger UI: `http://127.0.0.1:8000/docs`
- production API root on Render: the backend service URL from `render.yaml`

## Current API Areas

The current frontend depends primarily on these categories of endpoints:

- health and application stats
- scrape status and ingestion summary
- teams and team detail data
- analytics and report-oriented data
- authentication and user account flows

## Important Runtime Endpoints

### Health

```http
GET /health
```

Use this to confirm the backend is alive behind `/api/v1`.

### Application Stats

```http
GET /stats
```

Provides high-level application and dataset summary information used by the frontend.

### Scrape Status

```http
GET /scrape/status
```

Returns the current scrape state used by the dashboard, readiness banner, and ingestion view. Current responses may include fields such as:

- status
- scrape phase
- progress percent
- current run label

### Ingestion Summary

```http
GET /ingestion/comprehensive/summary
```

Returns richer ingestion metadata used by the ingestion page. Current responses may include fields such as:

- startup plan
- startup message
- load progress
- summary counts

### Manual Refresh

The backend also supports manual refresh actions used by the ingestion UI. Depending on the current route structure in the backend, refresh actions may trigger sample or full loads and report a run label that identifies the active mode.

## Local Development Notes

- The frontend API service tries to resolve the backend in a hostname-aware way so `localhost` and `127.0.0.1` do not create unnecessary local CORS confusion.
- If you change endpoint shapes that feed the dashboard, readiness banner, or ingestion screen, update the frontend consumers in the same branch.

## Source Of Truth

For the full current endpoint list and schemas, use the running backend Swagger UI at `/docs`. This file is intended as a practical overview rather than a generated endpoint catalog.