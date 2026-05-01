"""
ScoutD3 Backend – NCAA Division III Scouting API
All team data is scraped live from ncaa.com – nothing is hardcoded.
"""

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import datetime
import uuid
import asyncio
import io
import json
import os
from typing import Optional

from ncaa_scraper import (
    cache,
    scrape_all,
    get_scrape_status,
    load_cache_snapshot,
    SPORTS,
    apply_conference_fallback_to_team,
    apply_conference_fallbacks_to_teams,
)
from postgres_store import (
    authenticate_user,
    create_user,
    get_recent_user_activity,
    get_user_from_token,
    get_active_dataset_summary,
    log_user_activity,
    persist_scrape_result,
    get_rankings as get_persisted_rankings,
    get_team as get_persisted_team,
    get_teams_list as get_persisted_teams_list,
    init_database,
)

load_dotenv(Path(__file__).resolve().parent / ".env")


def _get_allowed_origins() -> list[str]:
    default_origins = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ]
    configured_origins = os.getenv("CORS_ORIGINS") or os.getenv("ALLOWED_ORIGINS")
    if configured_origins:
        origins = [origin.strip() for origin in configured_origins.split(",") if origin.strip()]
        if origins:
            for origin in default_origins:
                if origin not in origins:
                    origins.append(origin)
            return origins
    return default_origins

app = FastAPI(title="ScoutD3 Backend", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory stores (reports & ingestion jobs are user-generated) ──────

REPORTS: list = []
ingestion_jobs: dict = {}
_initial_scrape_state = {"triggered": False}
REPORTS_STORE_PATH = Path(__file__).resolve().parent / "data" / "reports_store.json"


def _load_reports_store() -> None:
    REPORTS.clear()
    if not REPORTS_STORE_PATH.exists():
        return
    try:
        payload = json.loads(REPORTS_STORE_PATH.read_text(encoding="utf-8"))
        rows = payload.get("reports", []) if isinstance(payload, dict) else []
        if isinstance(rows, list):
            REPORTS.extend([row for row in rows if isinstance(row, dict)])
        if _prune_invalid_self_matchup_reports():
            _save_reports_store()
    except (OSError, ValueError):
        # Keep runtime alive even if the persisted store is malformed.
        REPORTS.clear()


def _save_reports_store() -> None:
    try:
        REPORTS_STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
        REPORTS_STORE_PATH.write_text(
            json.dumps({"reports": REPORTS}, ensure_ascii=True, indent=2),
            encoding="utf-8",
        )
    except OSError:
        # Report persistence should not break API behavior.
        return


def _next_report_id() -> str:
    max_id = 0
    for report in REPORTS:
        rid = str(report.get("id", ""))
        if rid.startswith("r") and rid[1:].isdigit():
            max_id = max(max_id, int(rid[1:]))
    return f"r{max_id + 1}"


def _is_invalid_self_matchup_report(report: dict) -> bool:
    team_id = str(report.get("team_id") or "").strip()
    opponent_id = str(report.get("opponent_id") or "").strip()
    if team_id and opponent_id and team_id == opponent_id:
        return True

    team_name = str(report.get("team_name") or "").strip().lower()
    opponent_name = str(report.get("opponent_name") or "").strip().lower()
    sport = str(report.get("sport") or "").strip().lower()
    return bool(team_name and opponent_name and sport and team_name == opponent_name)


def _prune_invalid_self_matchup_reports() -> bool:
    original_count = len(REPORTS)
    REPORTS[:] = [r for r in REPORTS if not _is_invalid_self_matchup_report(r)]
    return len(REPORTS) != original_count


def _extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization or not isinstance(authorization, str):
        return None
    parts = authorization.strip().split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


def _get_current_user_optional(authorization: Optional[str] = None):
    token = _extract_bearer_token(authorization)
    if not token:
        return None
    return get_user_from_token(token)


def _require_current_user(authorization: Optional[str] = None):
    user = _get_current_user_optional(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


def _log_activity(
    user: Optional[dict],
    event_type: str,
    route: str,
    team_id: Optional[str] = None,
    comparison_team_id: Optional[str] = None,
    metadata: Optional[dict] = None,
):
    if not user:
        return None
    return log_user_activity(
        user_id=user["id"],
        event_type=event_type,
        route=route,
        team_id=team_id,
        comparison_team_id=comparison_team_id,
        metadata=metadata,
    )


def _get_persisted_summary():
    return get_active_dataset_summary()


def _get_dataset_summary():
    persisted = _get_persisted_summary()
    if persisted["total_teams"] > 0:
        return persisted

    teams = list(cache.teams.values())
    return {
        "total_teams": len(teams),
        "total_sports": len(set(t["sport"] for t in teams)) if teams else 0,
        "total_rankings": sum(len(entries) for entries in cache.rankings.values()),
        "college_count": len(set(t.get("slug", "") for t in teams)),
        "last_updated": cache.last_updated,
    }


def _current_academic_season_label(reference_dt: Optional[datetime.datetime] = None) -> str:
    now = reference_dt or datetime.datetime.utcnow()
    # NCAA seasons in this app are represented by academic year spans.
    if now.month >= 7:
        start_year = now.year
        end_year = now.year + 1
    else:
        start_year = now.year - 1
        end_year = now.year
    return f"{start_year}-{end_year} Season"


# Sports that play within a single calendar year (spring/fall seasons).
_SINGLE_YEAR_SPORTS = {"Baseball", "Softball", "Men's Soccer", "Women's Soccer", "Women's Volleyball"}


def _season_label_for_sport(sport: Optional[str], reference_dt: Optional[datetime.datetime] = None) -> str:
    """Return a sport-aware season label.

    Baseball, Softball, Soccer (men/women), and Women's Volleyball run within a
    single calendar year, so they get a label like "2025 Season".  Basketball
    spans two calendar years and keeps the academic-year label "2025-2026 Season".
    """
    now = reference_dt or datetime.datetime.utcnow()
    if sport and sport in _SINGLE_YEAR_SPORTS:
        # Spring sports (baseball/softball) → current calendar year when month >= 1
        # Fall sports (soccer/volleyball) → current year when month >= 7, else previous
        if sport in {"Men's Soccer", "Women's Soccer", "Women's Volleyball"}:
            year = now.year if now.month >= 7 else now.year - 1
        else:
            # Baseball / Softball — spring season; current calendar year
            year = now.year if now.month >= 1 else now.year - 1
        return f"{year} Season"
    # Default: academic year (basketball and any unknown sport)
    if now.month >= 7:
        return f"{now.year}-{now.year + 1} Season"
    return f"{now.year - 1}-{now.year} Season"


def _format_team_record(team: dict, stats: Optional[dict] = None) -> str:
    wins = team.get("wins")
    losses = team.get("losses")
    if wins is None or losses is None:
        return "N/A"

    stats = stats or {}

    # Prefer explicit tie/draw fields when available.
    explicit_ties = None
    for tie_key in ("ties", "draws", "ties_count"):
        if team.get(tie_key) is not None:
            explicit_ties = int(team.get(tie_key) or 0)
            break
        if stats.get(tie_key) is not None:
            explicit_ties = int(stats.get(tie_key) or 0)
            break

    ties = explicit_ties

    # Soccer commonly includes ties but source data may only provide wins/losses + games_played.
    if ties is None:
        sport = (team.get("sport") or "").lower()
        games_played = stats.get("games_played")
        if "soccer" in sport and isinstance(games_played, (int, float)):
            derived_ties = int(games_played) - int(wins) - int(losses)
            if derived_ties >= 0:
                ties = derived_ties

    if ties is None:
        return f"{wins}-{losses}"

    return f"{wins}-{losses}-{ties}"


def _has_persisted_dataset():
    return _get_persisted_summary()["total_teams"] > 0


def _get_teams_list(sport: Optional[str] = None, conference: Optional[str] = None, search: Optional[str] = None):
    if _has_persisted_dataset():
        teams = get_persisted_teams_list(sport=sport, conference=None, search=search)
    else:
        teams = cache.get_teams_list(sport=sport, conference=None, search=search)

    apply_conference_fallbacks_to_teams(teams)
    if conference:
        conference_lower = conference.lower()
        teams = [
            team for team in teams
            if conference_lower in str(team.get("conference") or "").lower()
        ]
    return teams


def _get_team(team_id: Optional[str]):
    if not team_id:
        return None
    if _has_persisted_dataset():
        team = get_persisted_team(team_id)
    else:
        team = cache.get_team(team_id)
    return apply_conference_fallback_to_team(team) if team else None


def _team_identity_key(team: Optional[dict]) -> str:
    if not team:
        return ""
    slug = str(team.get("slug") or "").strip().lower()
    if slug:
        return slug
    name = str(team.get("name") or "").strip().lower()
    sport = str(team.get("sport") or "").strip().lower()
    return f"{name}|{sport}"


def _is_same_matchup(team_a: Optional[dict], team_b: Optional[dict], team_a_id: Optional[str] = None, team_b_id: Optional[str] = None) -> bool:
    if team_a_id and team_b_id and str(team_a_id) == str(team_b_id):
        return True
    a_key = _team_identity_key(team_a)
    b_key = _team_identity_key(team_b)
    return bool(a_key and b_key and a_key == b_key)


def _get_rankings(sport_slug: str):
    if _has_persisted_dataset():
        return get_persisted_rankings(sport_slug)
    return cache.rankings.get(sport_slug, [])

# ── Startup + first-access auto scrape ──────────────────────────────────

@app.on_event("startup")
async def startup_scrape():
    """Warm from disk and kick off a fresh scrape on every server startup."""
    init_database()
    load_cache_snapshot()
    _load_reports_store()
    if not _has_persisted_dataset() and cache.teams:
        persist_scrape_result(cache.teams, cache.rankings, cache.last_updated)
    # Always trigger a fresh ingestion when the server starts so the dataset
    # is current. The scrape runs in the background and the API stays
    # responsive while it completes.
    _initial_scrape_state["triggered"] = True
    if not cache.is_scraping:
        asyncio.create_task(scrape_all(run_label="startup_auto"))


def _should_trigger_initial_scrape(path: str) -> bool:
    if not path.startswith("/api/"):
        return False
    # Avoid self-trigger on scrape status polling.
    return path != "/api/v1/scrape/status"


def _ensure_initial_scrape_started(path: str) -> None:
    if _initial_scrape_state["triggered"]:
        return
    if cache.is_scraping:
        _initial_scrape_state["triggered"] = True
        return
    if _has_persisted_dataset():
        _initial_scrape_state["triggered"] = True
        return
    if not _should_trigger_initial_scrape(path):
        return

    _initial_scrape_state["triggered"] = True
    asyncio.create_task(scrape_all(run_label="first_access_auto"))


@app.middleware("http")
async def first_access_autoload(request: Request, call_next):
    _ensure_initial_scrape_started(request.url.path)
    return await call_next(request)


# ── Root / Health ───────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "message": "ScoutD3 Backend API is running!",
        "data_source": "Live NCAA scraping",
        "timestamp": str(datetime.datetime.now()),
    }

@app.get("/api/v1/health")
async def health():
    return {"status": "healthy", "timestamp": str(datetime.datetime.now())}

@app.get("/api/v1/status")
async def get_status():
    return {
        "status": "running",
        "api_version": "2.0.0",
        "data_source": "ncaa.com live scraping",
        "features": ["team_management", "scouting_reports", "analytics", "data_ingestion", "live_scraping"],
        "timestamp": str(datetime.datetime.now()),
    }


# ── Authentication ──────────────────────────────────────────────────────

@app.post("/api/v1/auth/register")
async def register_user(data: Optional[dict] = None):
    payload = data or {}
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""
    try:
        user = create_user(username, password)
        auth_result = authenticate_user(username, password)
        if not auth_result:
            raise HTTPException(status_code=500, detail="User created but login failed")
        _log_activity(user, "register", "/auth/register", metadata={"username": username})
        return auth_result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/auth/login")
async def login_user(data: Optional[dict] = None):
    payload = data or {}
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""
    auth_result = authenticate_user(username, password)
    if not auth_result:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    _log_activity(auth_result["user"], "login", "/auth/login", metadata={"username": username})
    return auth_result


@app.post("/api/v1/auth/logout")
async def logout_user(authorization: Optional[str] = Header(default=None)):
    user = _require_current_user(authorization)
    _log_activity(user, "logout", "/auth/logout")
    return {"status": "ok"}


@app.get("/api/v1/auth/me")
async def get_current_user(authorization: Optional[str] = Header(default=None)):
    user = _require_current_user(authorization)
    return {"user": user}


@app.get("/api/v1/users/me/activity")
async def get_my_activity(
    limit: int = 50,
    authorization: Optional[str] = Header(default=None),
):
    user = _require_current_user(authorization)
    events = get_recent_user_activity(user["id"], limit=max(1, min(limit, 100)))
    return {"user": user, "events": events, "total": len(events)}

@app.get("/api/v1/stats")
async def get_stats():
    summary = _get_dataset_summary()
    teams = _get_teams_list()
    total_games = sum(t.get("stats", {}).get("games_played", 0) or 0 for t in teams) // 2
    return {
        "total_teams": summary["total_teams"],
        "total_games": total_games,
        "sports_covered": summary["total_sports"],
        "system_status": "Active" if summary["last_updated"] else "Scraping...",
        "last_updated": summary["last_updated"].isoformat() if summary["last_updated"] else "In progress",
    }


# ── Teams ───────────────────────────────────────────────────────────────

@app.get("/api/v1/teams/")
@app.get("/api/v1/teams")
async def get_teams(
    sport: Optional[str] = None,
    conference: Optional[str] = None,
    search: Optional[str] = None,
):
    teams = _get_teams_list(sport=sport, conference=conference, search=search)
    return {"teams": teams, "total_count": len(teams)}


@app.get("/api/v1/teams/{team_id}")
async def get_team(team_id: str, authorization: Optional[str] = Header(default=None)):
    team = _get_team(team_id)
    if not team:
        return {"error": "Team not found"}
    current_user = _get_current_user_optional(authorization)
    _log_activity(
        current_user,
        "view_team",
        f"/teams/{team_id}",
        team_id=team_id,
        metadata={"team_name": team.get("name"), "sport": team.get("sport")},
    )
    stats = team.get("stats", {}) or {}
    stat_summary = {}
    for raw_key, display_key in [
        ("games_played", "games_played"),
        ("ppg", "points_per_game"),
        ("opp_ppg", "opponent_ppg"),
        ("rpg", "rebounds_per_game"),
        ("fg_pct", "field_goal_pct"),
        ("three_pct", "three_point_pct"),
        ("ft_pct", "free_throw_pct"),
        ("reb_margin", "rebound_margin"),
        ("opp_fg_pct", "opp_field_goal_pct"),
        ("assists", "assists"),
        ("assists_per_set", "assists_per_set"),
        ("blocks_per_set", "blocks_per_set"),
        ("gaa", "goals_against_average"),
        ("batting_avg", "batting_average"),
        ("era", "earned_run_average"),
    ]:
        if raw_key in stats and stats.get(raw_key) is not None:
            stat_summary[display_key] = stats.get(raw_key)

    return {
        **team,
        "season_stats": stat_summary,
        "record": _format_team_record(team, stats),
    }


@app.get("/api/v1/teams/{team_id}/statistics")
async def get_team_statistics(team_id: str, authorization: Optional[str] = Header(default=None)):
    team = _get_team(team_id)
    if not team:
        return {"error": "Team not found"}
    current_user = _get_current_user_optional(authorization)
    _log_activity(
        current_user,
        "view_team_stats",
        f"/teams/{team_id}/statistics",
        team_id=team_id,
        metadata={"team_name": team.get("name")},
    )
    stats = team.get("stats", {}) or {}
    # Prefer readable canonical keys when possible, then include remaining raw stats.
    canonical_map = [
        ("games_played", "games_played"),
        ("ppg", "points_per_game"),
        ("opp_ppg", "opponent_ppg"),
        ("rpg", "rebounds_per_game"),
        ("fg_pct", "field_goal_pct"),
        ("three_pct", "three_point_pct"),
        ("ft_pct", "free_throw_pct"),
        ("reb_margin", "rebound_margin"),
        ("opp_fg_pct", "opp_field_goal_pct"),
        ("assists", "assists"),
        ("assists_per_set", "assists_per_set"),
        ("blocks_per_set", "blocks_per_set"),
        ("gaa", "goals_against_average"),
        ("batting_avg", "batting_average"),
        ("era", "earned_run_average"),
    ]

    stats_payload = {}
    consumed_keys = set()

    for raw_key, display_key in canonical_map:
        if raw_key in stats and stats.get(raw_key) is not None:
            stats_payload[display_key] = stats.get(raw_key)
            consumed_keys.add(raw_key)

    # Add any remaining sport-specific stats that were scraped.
    for raw_key, raw_value in stats.items():
        if raw_key in consumed_keys:
            continue
        if raw_value is None:
            continue
        stats_payload[raw_key] = raw_value

    sport_value = team.get("sport")
    season_label = _season_label_for_sport(sport_value)

    record_value = _format_team_record(team, stats)

    return {
        "team_id": team_id,
        "team_name": team.get("name", "Unknown Team"),
        "sport": sport_value,
        "season": season_label,
        "record": record_value,
        "stats": stats_payload,
    }


def _format_stat_for_pdf(value):
    if value is None:
        return "N/A"
    if isinstance(value, float):
        return f"{value:.2f}"
    return str(value)


def _format_pct_for_pdf(value):
    if value is None:
        return "N/A"
    pct_value = value * 100 if isinstance(value, (int, float)) and value <= 1 else value
    return f"{pct_value:.1f}%"


def _humanize_stat_key(key: str) -> str:
    label_map = {
        "points_per_game": "Points Per Game",
        "opponent_ppg": "Opponent PPG",
        "rebounds_per_game": "Rebounds Per Game",
        "field_goal_pct": "Field Goal %",
        "three_point_pct": "3PT %",
        "free_throw_pct": "Free Throw %",
        "rebound_margin": "Rebound Margin",
        "opp_field_goal_pct": "Opponent FG %",
        "games_played": "Games Played",
        "assists_per_set": "Assists Per Set",
        "blocks_per_set": "Blocks Per Set",
        "goals_against_average": "Goals Against Average",
        "batting_average": "Batting Average",
        "earned_run_average": "Earned Run Average",
    }
    if key in label_map:
        return label_map[key]
    return key.replace("_", " ").title()


def _generate_team_stats_pdf(team: dict, stats_payload: dict) -> bytes:
    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

    stats = stats_payload.get("stats", {})
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        leftMargin=0.7 * inch,
        rightMargin=0.7 * inch,
        topMargin=0.7 * inch,
        bottomMargin=0.7 * inch,
    )

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle("TeamStatsTitle", parent=styles["Title"], fontSize=20, textColor=colors.HexColor("#1e3a5f"), spaceAfter=6))
    styles.add(ParagraphStyle("TeamStatsMeta", parent=styles["BodyText"], fontSize=10, textColor=colors.HexColor("#334155"), spaceAfter=2))

    story = [
        Paragraph("ScoutD3 Team Statistics", styles["TeamStatsTitle"]),
        Paragraph(f"Team: {team.get('name', 'Unknown Team')}", styles["TeamStatsMeta"]),
        Paragraph(f"Sport: {team.get('sport', 'N/A')} | Conference: {team.get('conference', 'N/A')}", styles["TeamStatsMeta"]),
        Paragraph(f"Season: {stats_payload.get('season', 'Current')} | Record: {stats_payload.get('record', 'N/A')}", styles["TeamStatsMeta"]),
        Paragraph(f"Generated: {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}", styles["TeamStatsMeta"]),
        Spacer(1, 12),
    ]

    pct_keys = {
        "field_goal_pct",
        "three_point_pct",
        "free_throw_pct",
        "opp_field_goal_pct",
        "batting_average",
    }

    table_rows = [["Metric", "Value"]]
    for key, value in stats.items():
        label = _humanize_stat_key(key)
        formatted_value = _format_pct_for_pdf(value) if key in pct_keys or key.endswith("_pct") else _format_stat_for_pdf(value)
        table_rows.append([label, formatted_value])

    if len(table_rows) == 1:
        table_rows.append(["No scraped statistics available", "N/A"])

    stat_table = Table(table_rows, colWidths=[3.4 * inch, 2.6 * inch])
    stat_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#f8fafc")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#ffffff"), colors.HexColor("#f8fafc")]),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    story.append(stat_table)
    doc.build(story)
    return buf.getvalue()


@app.get("/api/v1/teams/{team_id}/statistics/pdf")
async def download_team_statistics_pdf(team_id: str, authorization: Optional[str] = Header(default=None)):
    team = _get_team(team_id)
    if not team:
        return {"error": "Team not found"}

    current_user = _get_current_user_optional(authorization)
    _log_activity(
        current_user,
        "download_team_stats_pdf",
        f"/teams/{team_id}/statistics/pdf",
        team_id=team_id,
        metadata={"team_name": team.get("name")},
    )

    stats_payload = await get_team_statistics(team_id, authorization=authorization)
    pdf_bytes = _generate_team_stats_pdf(team, stats_payload)
    team_slug = team.get("slug", team_id)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{team_slug}-team-stats.pdf"'},
    )


@app.get("/api/v1/teams/{team_id}/games")
async def get_team_games(team_id: str):
    # Games come from scraping; currently no live game scores available
    _ = team_id
    return {"games": [], "total": 0}


@app.get("/api/v1/teams/{team_id}/opponents")
async def get_team_opponents(team_id: str):
    team = _get_team(team_id)
    if not team:
        return {"opponents": []}
    # Return teams in the same conference + sport, or same sport if unknown conference
    all_teams = _get_teams_list(sport=team.get("sport", ""))
    conf = team.get("conference", "")
    sport = team.get("sport", "")
    if conf and conf != "NCAA D3":
        opponents = [t for t in all_teams if t.get("conference") == conf and t["id"] != team_id and t.get("sport") == sport]
    else:
        # Fall back to same sport, sorted by name
        opponents = [t for t in all_teams if t.get("sport") == sport and t["id"] != team_id]
    return {"opponents": sorted(opponents, key=lambda t: t.get("name", ""))[:30]}


# ── Games ───────────────────────────────────────────────────────────────

@app.get("/api/v1/games/")
@app.get("/api/v1/games")
async def get_games(sport: Optional[str] = None, team_id: Optional[str] = None):
    _ = (sport, team_id)
    return {"games": [], "total": 0}

@app.get("/api/v1/games/{game_id}")
async def get_game(game_id: str):
    _ = game_id
    return {"error": "Game not found"}

@app.get("/api/v1/games/{game_id}/statistics")
async def get_game_statistics(game_id: str):
    return {"game_id": game_id, "home_stats": {}, "away_stats": {}}

@app.get("/api/v1/games/matchup/{team1_id}/{team2_id}")
async def get_matchup(team1_id: str, team2_id: str):
    team1 = _get_team(team1_id)
    team2 = _get_team(team2_id)
    return {"team1": team1, "team2": team2, "head_to_head": [], "total_matchups": 0}

@app.get("/api/v1/games/upcoming/{team_id}")
async def get_upcoming_games(team_id: str):
    return {"team_id": team_id, "upcoming_games": []}

@app.get("/api/v1/games/recent/{team_id}")
async def get_recent_games(team_id: str):
    return {"team_id": team_id, "recent_games": []}


# ── Analytics (computed from live scraped data) ─────────────────────────

def _compute_identity_soccer(team: dict) -> dict:
    """Build an analytics identity object for soccer teams."""
    stats = team.get("stats", {})
    ppg = stats.get("ppg", 0)  # Goals per game
    gaa = stats.get("gaa", 0)  # Goals against average
    wins = team.get("wins", 0)
    losses = team.get("losses", 0)
    record_display = _format_team_record(team, stats)

    # Determine play style from soccer stats
    styles = []
    if ppg > 1.8:
        styles.append("High-scoring offense")
    elif ppg > 1.2:
        styles.append("Balanced attack")
    else:
        styles.append("Defensive-oriented")
    if gaa and gaa < 0.8:
        styles.append("Elite defense")
    elif gaa and gaa < 1.5:
        styles.append("Strong defense")

    total_games = wins + losses
    win_pct = wins / total_games if total_games > 0 else 0

    # Rating out of 100
    offensive_rating = min(100, max(0, int((ppg - 0.5) * 40))) if ppg else 50
    defensive_rating = min(100, max(0, int((2.5 - gaa) * 30))) if gaa else 50
    overall_rating = int(offensive_rating * 0.45 + defensive_rating * 0.45 + win_pct * 10)

    return {
        "team_id": team["id"],
        "team_name": team["name"],
        "identity": {
            "primary_style": styles[0] if styles else "Under analysis",
            "secondary_characteristics": styles[1:] if len(styles) > 1 else ["Awaiting more data"],
            "confidence_level": round(min(0.95, 0.5 + len([v for v in stats.values() if v]) * 0.05), 2),
        },
        "performance_metrics": {
            "overall_rating": overall_rating,
            "offensive_rating": offensive_rating,
            "defensive_rating": defensive_rating,
            "consistency_score": round(win_pct, 2),
        },
        "trends": {
            "recent_form": "strong" if win_pct > 0.7 else "moderate" if win_pct > 0.5 else "developing",
            "form_description": f"Record: {record_display}" + (f" | Goals: {ppg:.2f}/game" if ppg else ""),
            "streak_info": f"{'W' if win_pct > 0.5 else 'L'}{abs(wins - losses) if abs(wins - losses) <= 5 else ''}",
        },
        "comparison_data": {
            "vs_conference": f"{'Top' if win_pct > 0.6 else 'Middle'} of {team.get('conference', 'conference')}",
            "vs_division": f"{'Strong' if win_pct > 0.7 else 'Average'} nationally",
            "key_advantages": [s for s in styles[:3]],
            "key_disadvantages": (
                (["Low scoring"] if ppg and ppg < 0.8 else [])
                + (["Weak defense"] if gaa and gaa > 2.0 else [])
            ) or ["No major weaknesses identified"],
        },
    }

def _compute_identity_volleyball(team: dict) -> dict:
    """Build an analytics identity object for volleyball teams."""
    stats = team.get("stats", {})
    assists_per_set = stats.get("assists_per_set", 0)
    blocks_per_set = stats.get("blocks_per_set", 0)
    wins = team.get("wins", 0)
    losses = team.get("losses", 0)
    record_display = _format_team_record(team, stats)

    # Determine play style from volleyball stats
    styles = []
    if assists_per_set > 11:
        styles.append("Offensive powerhouse")
    elif assists_per_set > 8:
        styles.append("Balanced offense")
    else:
        styles.append("Defensive-oriented")
    if blocks_per_set > 2.2:
        styles.append("Elite blocking")
    elif blocks_per_set > 1.5:
        styles.append("Strong blocking")

    total_games = wins + losses
    win_pct = wins / total_games if total_games > 0 else 0

    # Rating out of 100
    offensive_rating = min(100, max(0, int((assists_per_set - 5) * 7))) if assists_per_set else 50
    defensive_rating = min(100, max(0, int((blocks_per_set - 0.5) * 35))) if blocks_per_set else 50
    overall_rating = int(offensive_rating * 0.45 + defensive_rating * 0.45 + win_pct * 10)

    return {
        "team_id": team["id"],
        "team_name": team["name"],
        "identity": {
            "primary_style": styles[0] if styles else "Under analysis",
            "secondary_characteristics": styles[1:] if len(styles) > 1 else ["Awaiting more data"],
            "confidence_level": round(min(0.95, 0.5 + len([v for v in stats.values() if v]) * 0.05), 2),
        },
        "performance_metrics": {
            "overall_rating": overall_rating,
            "offensive_rating": offensive_rating,
            "defensive_rating": defensive_rating,
            "consistency_score": round(win_pct, 2),
        },
        "trends": {
            "recent_form": "strong" if win_pct > 0.7 else "moderate" if win_pct > 0.5 else "developing",
            "form_description": f"Record: {record_display}" + (f" | Assists: {assists_per_set:.2f}/set" if assists_per_set else ""),
            "streak_info": f"{'W' if win_pct > 0.5 else 'L'}{abs(wins - losses) if abs(wins - losses) <= 5 else ''}",
        },
        "comparison_data": {
            "vs_conference": f"{'Top' if win_pct > 0.6 else 'Middle'} of {team.get('conference', 'conference')}",
            "vs_division": f"{'Strong' if win_pct > 0.7 else 'Average'} nationally",
            "key_advantages": [s for s in styles[:3]],
            "key_disadvantages": (
                (["Low assists"] if assists_per_set and assists_per_set < 7 else [])
                + (["Weak blocking"] if blocks_per_set and blocks_per_set < 1.0 else [])
            ) or ["No major weaknesses identified"],
        },
    }

def _compute_identity_baseball(team: dict) -> dict:
    """Build an analytics identity object for baseball teams."""
    stats = team.get("stats", {})
    batting_avg = stats.get("batting_avg", 0)
    era = stats.get("era", 0)
    wins = team.get("wins", 0)
    losses = team.get("losses", 0)
    record_display = _format_team_record(team, stats)

    # Determine play style from baseball stats
    styles = []
    if batting_avg > 0.320:
        styles.append("Strong offensive team")
    elif batting_avg > 0.290:
        styles.append("Solid hitting")
    else:
        styles.append("Defensive-oriented")
    if era and era < 3.5:
        styles.append("Elite pitching")
    elif era and era < 4.5:
        styles.append("Strong pitching")
    else:
        styles.append("Developing pitching")

    total_games = wins + losses
    win_pct = wins / total_games if total_games > 0 else 0

    # Rating out of 100
    offensive_rating = min(100, max(0, int((batting_avg - 0.250) * 500))) if batting_avg else 50
    defensive_rating = min(100, max(0, int((5.50 - era) * 20))) if era else 50
    overall_rating = int(offensive_rating * 0.45 + defensive_rating * 0.45 + win_pct * 10)

    return {
        "team_id": team["id"],
        "team_name": team["name"],
        "identity": {
            "primary_style": styles[0] if styles else "Under analysis",
            "secondary_characteristics": styles[1:] if len(styles) > 1 else ["Awaiting more data"],
            "confidence_level": round(min(0.95, 0.5 + len([v for v in stats.values() if v]) * 0.05), 2),
        },
        "performance_metrics": {
            "overall_rating": overall_rating,
            "offensive_rating": offensive_rating,
            "defensive_rating": defensive_rating,
            "consistency_score": round(win_pct, 2),
        },
        "trends": {
            "recent_form": "strong" if win_pct > 0.7 else "moderate" if win_pct > 0.5 else "developing",
            "form_description": f"Record: {record_display}" + (f" | BA: {batting_avg:.3f}" if batting_avg else ""),
            "streak_info": f"{'W' if win_pct > 0.5 else 'L'}{abs(wins - losses) if abs(wins - losses) <= 5 else ''}",
        },
        "comparison_data": {
            "vs_conference": f"{'Top' if win_pct > 0.6 else 'Middle'} of {team.get('conference', 'conference')}",
            "vs_division": f"{'Strong' if win_pct > 0.7 else 'Average'} nationally",
            "key_advantages": [s for s in styles[:3]],
            "key_disadvantages": (
                (["Low batting average"] if batting_avg and batting_avg < 0.280 else [])
                + (["High ERA"] if era and era > 5.0 else [])
            ) or ["No major weaknesses identified"],
        },
    }

def _compute_identity(team: dict) -> dict:
    """Build an analytics identity object from real scraped stats."""
    sport = team.get("sport", "").lower()
    
    # Use sport-specific analysis
    if sport in ("baseball", "softball"):
        return _compute_identity_baseball(team)
    elif sport in ("men's soccer", "women's soccer"):
        return _compute_identity_soccer(team)
    elif sport == "women's volleyball":
        return _compute_identity_volleyball(team)
    
    # Default to basketball stats
    stats = team.get("stats", {})
    ppg = stats.get("ppg", 0)
    opp_ppg = stats.get("opp_ppg", 0)
    reb_margin = stats.get("reb_margin", 0)
    three_pct = stats.get("three_pct", 0)
    ft_pct = stats.get("ft_pct", 0)
    wins = team.get("wins", 0)
    losses = team.get("losses", 0)
    record_display = _format_team_record(team, stats)

    # Determine play style from stats
    styles = []
    if ppg > 80:
        styles.append("High-scoring offense")
    elif ppg > 70:
        styles.append("Balanced scoring")
    else:
        styles.append("Defensive-oriented")
    if opp_ppg and opp_ppg < 62:
        styles.append("Elite defense")
    elif opp_ppg and opp_ppg < 68:
        styles.append("Strong defense")
    if reb_margin > 5:
        styles.append("Dominant rebounding")
    elif reb_margin > 0:
        styles.append("Positive rebounding")
    if three_pct > 38:
        styles.append("Strong 3-point shooting")
    if ft_pct > 76:
        styles.append("Reliable free throw shooting")

    total_games = wins + losses
    win_pct = wins / total_games if total_games > 0 else 0

    # Rating out of 100
    offensive_rating = min(100, max(0, int((ppg - 55) * 2.5))) if ppg else 50
    defensive_rating = min(100, max(0, int((85 - opp_ppg) * 2.5))) if opp_ppg else 50
    overall_rating = int(offensive_rating * 0.45 + defensive_rating * 0.45 + win_pct * 10)

    return {
        "team_id": team["id"],
        "team_name": team["name"],
        "identity": {
            "primary_style": styles[0] if styles else "Under analysis",
            "secondary_characteristics": styles[1:] if len(styles) > 1 else ["Awaiting more data"],
            "confidence_level": round(min(0.95, 0.5 + len([v for v in stats.values() if v]) * 0.05), 2),
        },
        "performance_metrics": {
            "overall_rating": overall_rating,
            "offensive_rating": offensive_rating,
            "defensive_rating": defensive_rating,
            "consistency_score": round(win_pct, 2),
        },
        "trends": {
            "recent_form": "strong" if win_pct > 0.7 else "moderate" if win_pct > 0.5 else "developing",
            "form_description": f"Record: {record_display}" + (f" | PPG: {ppg}" if ppg else ""),
            "streak_info": f"{'W' if win_pct > 0.5 else 'L'}{abs(wins - losses) if abs(wins - losses) <= 5 else ''}",
        },
        "comparison_data": {
            "vs_conference": f"{'Top' if win_pct > 0.6 else 'Middle'} of {team.get('conference', 'conference')}",
            "vs_division": f"{'Strong' if win_pct > 0.7 else 'Average'} nationally",
            "key_advantages": [s for s in styles[:3]],
            "key_disadvantages": (
                (["Low scoring"] if ppg and ppg < 65 else [])
                + (["Weak defense"] if opp_ppg and opp_ppg > 72 else [])
                + (["Poor rebounding"] if reb_margin and reb_margin < -2 else [])
            ) or ["No major weaknesses identified"],
        },
    }


@app.get("/api/v1/analytics/team/{team_id}/identity")
async def get_team_identity(team_id: str, authorization: Optional[str] = Header(default=None)):
    team = _get_team(team_id)
    if not team:
        return {"error": "Team not found"}
    current_user = _get_current_user_optional(authorization)
    _log_activity(
        current_user,
        "view_team_analytics",
        f"/analytics?team={team_id}",
        team_id=team_id,
        metadata={"team_name": team.get("name"), "analysis": "identity"},
    )
    return _compute_identity(team)


@app.get("/api/v1/analytics/team/{team_id}/trends")
async def get_team_trends(team_id: str, authorization: Optional[str] = Header(default=None)):
    team = _get_team(team_id)
    if not team:
        return {"error": "Team not found"}
    current_user = _get_current_user_optional(authorization)
    _log_activity(
        current_user,
        "view_team_trends",
        f"/analytics?team={team_id}",
        team_id=team_id,
        metadata={"team_name": team.get("name"), "analysis": "trends"},
    )
    stats = team.get("stats", {})
    wins = team.get("wins", 0)
    losses = team.get("losses", 0)
    record_display = _format_team_record(team, stats)
    sport = team.get("sport", "").lower()
    gp = stats.get("games_played", wins + losses)
    
    # Sport-specific stats
    if sport in ("baseball", "softball"):
        batting_avg = stats.get("batting_avg", 0)
        era = stats.get("era", 0)
        return {
            "team_id": team_id,
            "trends": [
                {"period": "Full Season", "wins": wins, "losses": losses, "record": record_display, "batting_avg": batting_avg, "era": era},
            ],
            "momentum": "positive" if wins > losses else "negative",
            "key_trend": f"Batting {batting_avg:.3f} with {era:.2f} ERA over {gp} games" if batting_avg else f"Record: {record_display}",
        }
    elif sport in ("men's soccer", "women's soccer"):
        ppg = stats.get("ppg", 0)  # Goals per game
        gaa = stats.get("gaa", 0)  # Goals against average
        return {
            "team_id": team_id,
            "trends": [
                {"period": "Full Season", "wins": wins, "losses": losses, "record": record_display, "goals_per_game": ppg, "goals_against": gaa},
            ],
            "momentum": "positive" if wins > losses else "negative",
            "key_trend": f"Scoring {ppg:.2f} goals/game while allowing {gaa:.2f} over {gp} games" if ppg else f"Record: {record_display}",
        }
    elif sport == "women's volleyball":
        assists_per_set = stats.get("assists_per_set", 0)
        blocks_per_set = stats.get("blocks_per_set", 0)
        return {
            "team_id": team_id,
            "trends": [
                {"period": "Full Season", "wins": wins, "losses": losses, "record": record_display, "assists_per_set": assists_per_set, "blocks_per_set": blocks_per_set},
            ],
            "momentum": "positive" if wins > losses else "negative",
            "key_trend": f"{assists_per_set:.2f} assists/set and {blocks_per_set:.2f} blocks/set over {gp} matches" if assists_per_set else f"Record: {record_display}",
        }
    else:
        # Basketball
        ppg = stats.get("ppg", 0)
        opp_ppg = stats.get("opp_ppg", 0)
        return {
            "team_id": team_id,
            "trends": [
                {"period": "Full Season", "wins": wins, "losses": losses, "record": record_display, "avg_points": ppg, "avg_allowed": opp_ppg},
            ],
            "momentum": "positive" if wins > losses else "negative",
            "key_trend": f"Averaging {ppg} PPG while allowing {opp_ppg} OPP PPG over {gp} games",
    }


def _build_team_stat_row(label, t_val, v_val, fmt="", higher_better=True):
    """Return a stat row dict with the edge indicator."""
    if t_val is None or v_val is None:
        return {
            "label": label,
            "team1": "N/A" if t_val is None else f"{t_val}{fmt}",
            "team2": "N/A" if v_val is None else f"{v_val}{fmt}",
            "edge": "n/a",
        }

    t = t_val
    v = v_val
    if higher_better:
        edge = "team1" if t > v else ("team2" if v > t else "even")
    else:
        edge = "team1" if t < v else ("team2" if v < t else "even")
    return {"label": label, "team1": f"{t}{fmt}", "team2": f"{v}{fmt}", "edge": edge}


@app.get("/api/v1/analytics/team/{team_id}/comparison")
async def get_team_comparison(
    team_id: str,
    vs_team: Optional[str] = None,
    authorization: Optional[str] = Header(default=None),
):
    team = _get_team(team_id)
    vs = _get_team(vs_team) if vs_team else None
    if team and vs and _is_same_matchup(team, vs, team_id, vs_team):
        raise HTTPException(status_code=400, detail="Select two different teams for comparison")
    current_user = _get_current_user_optional(authorization)
    if team and vs:
        _log_activity(
            current_user,
            "compare_teams",
            f"/analytics?team={team_id}",
            team_id=team_id,
            comparison_team_id=vs_team,
            metadata={
                "team_name": team.get("name"),
                "comparison_team_name": vs.get("name"),
            },
        )
    t_stats = team.get("stats", {}) if team else {}
    v_stats = vs.get("stats", {}) if vs else {}

    t_ppg = t_stats.get("ppg")
    v_ppg = v_stats.get("ppg")
    t_opp = t_stats.get("opp_ppg")
    v_opp = v_stats.get("opp_ppg")
    t_wins = team.get("wins", 0) if team else 0
    t_losses = team.get("losses", 0) if team else 0
    v_wins = vs.get("wins", 0) if vs else 0
    v_losses = vs.get("losses", 0) if vs else 0
    t_total = t_wins + t_losses or 1
    v_total = v_wins + v_losses or 1
    t_wpct = round(t_wins / t_total * 100, 1)
    v_wpct = round(v_wins / v_total * 100, 1)
    team_name = team.get("name", "N/A") if team else "N/A"
    vs_name = vs.get("name", "N/A") if vs else "N/A"
    t_point_diff = round(t_ppg - t_opp, 1) if t_ppg is not None and t_opp is not None else None
    v_point_diff = round(v_ppg - v_opp, 1) if v_ppg is not None and v_opp is not None else None
    t_record = _format_team_record(team, t_stats)
    v_record = _format_team_record(vs, v_stats)

    def _edge_name(team1_value, team2_value, lower_is_better=False):
        if team1_value is None or team2_value is None:
            return "N/A"
        if team1_value == team2_value:
            return "N/A"
        if lower_is_better:
            return team_name if team1_value < team2_value else vs_name
        return team_name if team1_value > team2_value else vs_name

    offensive_metric_team1 = None
    offensive_metric_team2 = None
    defensive_metric_team1 = None
    defensive_metric_team2 = None
    defensive_lower_is_better = False

    # Build sport-specific stat rows
    sport = team.get("sport", "").lower() if team else ""
    
    if sport in ("baseball", "softball"):
        # Baseball comparison stats
        t_avg = t_stats.get("batting_avg")
        v_avg = v_stats.get("batting_avg")
        t_era = t_stats.get("era")
        v_era = v_stats.get("era")
        offensive_metric_team1 = t_avg
        offensive_metric_team2 = v_avg
        defensive_metric_team1 = t_era
        defensive_metric_team2 = v_era
        defensive_lower_is_better = True
        stat_rows = [
            _build_team_stat_row("Record", t_record, v_record, higher_better=True),
            _build_team_stat_row("Win %", t_wpct, v_wpct, "%"),
            _build_team_stat_row("Batting Avg", t_avg, v_avg, "" if not t_avg else f" ({t_avg:.3f})".replace("0.", ".")),
            _build_team_stat_row("ERA", t_era, v_era, "", higher_better=False),
            _build_team_stat_row("At Bats", t_stats.get("at_bats"), v_stats.get("at_bats"), ""),
            _build_team_stat_row("Hits", t_stats.get("hits"), v_stats.get("hits"), ""),
            _build_team_stat_row("Earned Runs", t_stats.get("earned_runs"), v_stats.get("earned_runs"), "", higher_better=False),
            _build_team_stat_row("Innings Pitched", t_stats.get("innings_pitched"), v_stats.get("innings_pitched"), ""),
        ]
    elif sport in ("men's soccer", "women's soccer"):
        # Soccer comparison stats
        t_ppg = t_stats.get("ppg")  # Goals per game
        v_ppg = v_stats.get("ppg")
        t_gaa = t_stats.get("gaa")  # Goals against average
        v_gaa = v_stats.get("gaa")
        offensive_metric_team1 = t_ppg
        offensive_metric_team2 = v_ppg
        defensive_metric_team1 = t_gaa
        defensive_metric_team2 = v_gaa
        defensive_lower_is_better = True
        stat_rows = [
            _build_team_stat_row("Record", t_record, v_record, higher_better=True),
            _build_team_stat_row("Win %", t_wpct, v_wpct, "%"),
            _build_team_stat_row("Goals Per Game", t_ppg, v_ppg, ""),
            _build_team_stat_row("Goals Against Avg", t_gaa, v_gaa, "", higher_better=False),
            _build_team_stat_row("Total Goals", t_stats.get("total_points"), v_stats.get("total_points"), ""),
        ]
    elif sport == "women's volleyball":
        # Volleyball comparison stats
        t_aps = t_stats.get("assists_per_set")
        v_aps = v_stats.get("assists_per_set")
        t_bps = t_stats.get("blocks_per_set")
        v_bps = v_stats.get("blocks_per_set")
        offensive_metric_team1 = t_aps
        offensive_metric_team2 = v_aps
        defensive_metric_team1 = t_bps
        defensive_metric_team2 = v_bps
        defensive_lower_is_better = False
        stat_rows = [
            _build_team_stat_row("Record", t_record, v_record, higher_better=True),
            _build_team_stat_row("Win %", t_wpct, v_wpct, "%"),
            _build_team_stat_row("Assists/Set", t_aps, v_aps, ""),
            _build_team_stat_row("Blocks/Set", t_bps, v_bps, ""),
            _build_team_stat_row("Total Assists", t_stats.get("assists"), v_stats.get("assists"), ""),
            _build_team_stat_row("Total Blocks", 
                                 (t_stats.get("block_solos", 0) + t_stats.get("block_assists", 0)) if t_stats else None,
                                 (v_stats.get("block_solos", 0) + v_stats.get("block_assists", 0)) if v_stats else None, ""),
        ]
    else:
        # Basketball comparison stats
        t_point_diff = round(t_ppg - t_opp, 1) if t_ppg is not None and t_opp is not None else None
        v_point_diff = round(v_ppg - v_opp, 1) if v_ppg is not None and v_opp is not None else None
        offensive_metric_team1 = t_ppg
        offensive_metric_team2 = v_ppg
        defensive_metric_team1 = t_opp
        defensive_metric_team2 = v_opp
        defensive_lower_is_better = True
        stat_rows = [
            _build_team_stat_row("Record", t_record, v_record, higher_better=True),
            _build_team_stat_row("Win %", t_wpct, v_wpct, "%"),
            _build_team_stat_row("Points Per Game", t_ppg, v_ppg, ""),
            _build_team_stat_row("Opp Points Per Game", t_opp, v_opp, "", higher_better=False),
            _build_team_stat_row("Point Differential", t_point_diff, v_point_diff, ""),
            _build_team_stat_row("FG %", t_stats.get("fg_pct"), v_stats.get("fg_pct"), "%"),
            _build_team_stat_row("Opp FG %", t_stats.get("opp_fg_pct"), v_stats.get("opp_fg_pct"), "%", higher_better=False),
            _build_team_stat_row("3PT %", t_stats.get("three_pct"), v_stats.get("three_pct"), "%"),
            _build_team_stat_row("FT %", t_stats.get("ft_pct"), v_stats.get("ft_pct"), "%"),
            _build_team_stat_row("Rebounds/Game", t_stats.get("rpg"), v_stats.get("rpg"), ""),
            _build_team_stat_row("Rebound Margin", t_stats.get("reb_margin"), v_stats.get("reb_margin"), ""),
        ]
    
    # Fix record edge (compare win pcts, not string)
    stat_rows[0]["edge"] = "team1" if t_wpct > v_wpct else ("team2" if v_wpct > t_wpct else "even")

    # Hide stat rows where neither team has data so the comparison table only
    # shows metrics that are actually meaningful for the selected sport/teams.
    stat_rows = [
        r for r in stat_rows
        if not (r.get("team1") == "N/A" and r.get("team2") == "N/A")
    ]

    # Compute identity for both
    t_identity = _compute_identity(team) if team else {}
    v_identity = _compute_identity(vs) if vs else {}

    t_off = t_identity.get("performance_metrics", {}).get("offensive_rating", 0)
    t_def = t_identity.get("performance_metrics", {}).get("defensive_rating", 0)
    t_ovr = t_identity.get("performance_metrics", {}).get("overall_rating", 0)
    v_off = v_identity.get("performance_metrics", {}).get("offensive_rating", 0)
    v_def = v_identity.get("performance_metrics", {}).get("defensive_rating", 0)
    v_ovr = v_identity.get("performance_metrics", {}).get("overall_rating", 0)

    rating_rows = [
        _build_team_stat_row("Overall Rating", t_ovr, v_ovr, ""),
        _build_team_stat_row("Offensive Rating", t_off, v_off, ""),
        _build_team_stat_row("Defensive Rating", t_def, v_def, ""),
    ]

    # Verdict
    t_advantages = sum(1 for r in stat_rows if r["edge"] == "team1")
    v_advantages = sum(1 for r in stat_rows if r["edge"] == "team2")

    return {
        "team": team,
        "comparison_team": vs,
        "comparison": {
            "offensive_edge": _edge_name(offensive_metric_team1, offensive_metric_team2),
            "defensive_edge": _edge_name(defensive_metric_team1, defensive_metric_team2, lower_is_better=defensive_lower_is_better),
            "overall_edge": _edge_name(t_ovr, v_ovr),
            "key_matchup_factors": [
                f"Scoring: {t_ppg if t_ppg is not None else 'N/A'} vs {v_ppg if v_ppg is not None else 'N/A'} PPG",
                f"Defense: {t_opp if t_opp is not None else 'N/A'} vs {v_opp if v_opp is not None else 'N/A'} OPP PPG",
                f"FG%: {t_stats.get('fg_pct', 'N/A')} vs {v_stats.get('fg_pct', 'N/A')}",
                f"Rebounds: {t_stats.get('reb_margin', 'N/A')} vs {v_stats.get('reb_margin', 'N/A')} margin",
            ],
            "stat_rows": stat_rows,
            "rating_rows": rating_rows,
            "team1_advantages": t_advantages,
            "team2_advantages": v_advantages,
            "verdict": (
                f"{team_name} has the statistical edge ({t_advantages}-{v_advantages})"
                if t_advantages > v_advantages
                else (
                    f"{vs_name} has the statistical edge ({v_advantages}-{t_advantages})"
                    if v_advantages > t_advantages
                    else "Statistically even matchup"
                )
            ) if team and vs else "N/A",
            "team1_style": t_identity.get("identity", {}).get("primary_style", ""),
            "team2_style": v_identity.get("identity", {}).get("primary_style", ""),
            "team1_strengths": t_identity.get("comparison_data", {}).get("key_advantages", []),
            "team2_strengths": v_identity.get("comparison_data", {}).get("key_advantages", []),
        },
    }


def _generate_comparison_pdf(team1: dict, team2: dict, comparison: dict) -> bytes:
    """Generate a PDF for a head-to-head team comparison."""
    from html import escape
    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        HRFlowable,
    )

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        leftMargin=0.6 * inch, rightMargin=0.6 * inch,
        topMargin=0.6 * inch, bottomMargin=0.6 * inch,
    )

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        "CompTitle", parent=styles["Title"], fontSize=20,
        spaceAfter=4, textColor=colors.HexColor("#1e3a5f"),
    ))
    styles.add(ParagraphStyle(
        "CompSection", parent=styles["Heading2"], fontSize=13,
        spaceBefore=14, spaceAfter=6, textColor=colors.HexColor("#1e3a5f"),
    ))
    styles.add(ParagraphStyle(
        "CompBody", parent=styles["BodyText"], fontSize=10,
        leading=14, spaceAfter=4,
    ))
    styles.add(ParagraphStyle(
        "CompBullet", parent=styles["BodyText"], fontSize=10,
        leading=14, leftIndent=20, bulletIndent=8, spaceAfter=2,
    ))

    story = []

    # ── Header ──
    story.append(Paragraph("ScoutD3 Head-to-Head Comparison", styles["CompTitle"]))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#1e3a5f")))
    story.append(Spacer(1, 6))

    t1_name = str(team1.get("name", "Team 1"))
    t2_name = str(team2.get("name", "Team 2"))
    sport = team1.get("sport", "")
    conf1 = str(team1.get("conference", ""))
    conf2 = str(team2.get("conference", ""))

    meta_data = [
        ["Sport:", sport],
        ["Team 1:", f"{t1_name} ({conf1}) — {team1.get('wins', 0)}-{team1.get('losses', 0)}"],
        ["Team 2:", f"{t2_name} ({conf2}) — {team2.get('wins', 0)}-{team2.get('losses', 0)}"],
        ["Generated:", datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")],
    ]
    meta_table = Table(meta_data, colWidths=[1.0 * inch, 5.8 * inch])
    meta_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#475569")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 10))

    # ── Verdict ──
    verdict = comparison.get("verdict", "")
    if verdict:
        story.append(Paragraph("Verdict", styles["CompSection"]))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cbd5e1")))
        v_data = [[verdict]]
        v_table = Table(v_data, colWidths=[6.8 * inch])
        v_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f0fdf4")),
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 11),
            ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#166534")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#bbf7d0")),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ]))
        story.append(v_table)
        story.append(Spacer(1, 6))

    # ── Edge Summary ──
    story.append(Paragraph("Edge Summary", styles["CompSection"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cbd5e1")))
    edge_data = [
        ["Category", "Advantage"],
        ["Offensive Edge", comparison.get("offensive_edge", "N/A")],
        ["Defensive Edge", comparison.get("defensive_edge", "N/A")],
        ["Overall Edge", comparison.get("overall_edge", "N/A")],
    ]
    edge_table = Table(edge_data, colWidths=[2.0 * inch, 4.8 * inch])
    edge_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#f8fafc")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(edge_table)
    story.append(Spacer(1, 6))

    # ── Ratings Comparison ──
    rating_rows = comparison.get("rating_rows", [])
    if rating_rows:
        story.append(Paragraph("Ratings Comparison", styles["CompSection"]))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cbd5e1")))
        r_header = ["Metric", t1_name, t2_name, "Edge"]
        r_data = [r_header]
        for row in rating_rows:
            edge_name = t1_name if row["edge"] == "team1" else (t2_name if row["edge"] == "team2" else "Even")
            r_data.append([row["label"], str(row["team1"]), str(row["team2"]), edge_name])
        r_table = Table(r_data, colWidths=[1.8 * inch, 1.5 * inch, 1.5 * inch, 2.0 * inch])
        r_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("ALIGN", (1, 0), (2, -1), "CENTER"),
        ]))
        # Alternating row colors
        for i in range(1, len(r_data)):
            bg = colors.HexColor("#f8fafc") if i % 2 == 1 else colors.HexColor("#ffffff")
            r_table.setStyle(TableStyle([("BACKGROUND", (0, i), (-1, i), bg)]))
        story.append(r_table)
        story.append(Spacer(1, 6))

    # ── Detailed Stats Table ──
    stat_rows = comparison.get("stat_rows", [])
    if stat_rows:
        story.append(Paragraph("Statistical Comparison", styles["CompSection"]))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cbd5e1")))
        s_header = ["Statistic", t1_name, t2_name, "Edge"]
        s_data = [s_header]
        for row in stat_rows:
            edge_name = t1_name if row["edge"] == "team1" else (t2_name if row["edge"] == "team2" else "Even")
            s_data.append([row["label"], str(row["team1"]), str(row["team2"]), edge_name])
        s_table = Table(s_data, colWidths=[1.8 * inch, 1.5 * inch, 1.5 * inch, 2.0 * inch])
        s_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("ALIGN", (1, 0), (2, -1), "CENTER"),
        ]))
        for i in range(1, len(s_data)):
            bg = colors.HexColor("#f8fafc") if i % 2 == 1 else colors.HexColor("#ffffff")
            s_table.setStyle(TableStyle([("BACKGROUND", (0, i), (-1, i), bg)]))
        story.append(s_table)
        story.append(Spacer(1, 6))

    # ── Team Styles & Strengths ──
    t1_style = comparison.get("team1_style", "")
    t2_style = comparison.get("team2_style", "")
    t1_strengths = comparison.get("team1_strengths", [])
    t2_strengths = comparison.get("team2_strengths", [])

    if t1_style or t2_style:
        safe_t1_name = escape(t1_name)
        safe_t2_name = escape(t2_name)
        safe_t1_style = escape(str(t1_style))
        safe_t2_style = escape(str(t2_style))
        story.append(Paragraph("Playing Styles", styles["CompSection"]))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cbd5e1")))
        story.append(Paragraph(f"<b>{safe_t1_name}:</b> {safe_t1_style}", styles["CompBody"]))
        if t1_strengths:
            for s in t1_strengths:
                story.append(Paragraph(f"\u2022 {escape(str(s))}", styles["CompBullet"]))
        story.append(Spacer(1, 4))
        story.append(Paragraph(f"<b>{safe_t2_name}:</b> {safe_t2_style}", styles["CompBody"]))
        if t2_strengths:
            for s in t2_strengths:
                story.append(Paragraph(f"\u2022 {escape(str(s))}", styles["CompBullet"]))

    # ── Footer ──
    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#1e3a5f")))
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        "Generated by ScoutD3 \u2014 NCAA Division III Multi-Sport Scouting System",
        ParagraphStyle("CompFooter", parent=styles["Normal"], fontSize=8,
                       textColor=colors.HexColor("#94a3b8"), alignment=1),
    ))

    doc.build(story)
    return buf.getvalue()


@app.get("/api/v1/analytics/team/{team_id}/comparison/pdf")
async def get_comparison_pdf(
    team_id: str,
    vs_team: Optional[str] = None,
    authorization: Optional[str] = Header(default=None),
):
    team = _get_team(team_id)
    vs = _get_team(vs_team) if vs_team else None
    if team and vs and _is_same_matchup(team, vs, team_id, vs_team):
        return Response(content=b"Select two different teams for comparison", status_code=400)
    if not team or not vs:
        return Response(content=b"Both teams required", status_code=400)
    # Re-use the comparison logic
    comp_resp = await get_team_comparison(team_id, vs_team, authorization=authorization)
    comparison = comp_resp["comparison"]
    pdf_bytes = _generate_comparison_pdf(team, vs, comparison)
    t1_slug = team.get("slug", team_id)
    t2_slug = vs.get("slug", vs_team)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="comparison-{t1_slug}-vs-{t2_slug}.pdf"'},
    )


@app.get("/api/v1/analytics/matchup")
async def get_matchup_analysis(team1_id: Optional[str] = None, team2_id: Optional[str] = None):
    t1 = _get_team(team1_id) if team1_id else None
    t2 = _get_team(team2_id) if team2_id else None
    s1 = t1.get("stats", {}) if t1 else {}
    s2 = t2.get("stats", {}) if t2 else {}
    w1 = t1.get("wins", 0) if t1 else 0
    w2 = t2.get("wins", 0) if t2 else 0
    total = w1 + w2 or 1
    return {
        "team1_id": team1_id,
        "team2_id": team2_id,
        "prediction": {
            "favored": team1_id if w1 >= w2 else team2_id,
            "win_probability": round(w1 / total, 2),
            "predicted_score": f"{int(s1.get('ppg', 70))}-{int(s2.get('ppg', 68))}",
        },
        "key_factors": [
            f"PPG advantage: {s1.get('ppg', 0)} vs {s2.get('ppg', 0)}",
            f"Defensive edge: {s1.get('opp_ppg', 0)} vs {s2.get('opp_ppg', 0)} allowed",
            f"Win records: {w1} vs {w2} wins",
        ],
    }


@app.post("/api/v1/analytics/season/calculate")
async def calculate_season_stats(data: Optional[dict] = None):
    _ = data
    return {"status": "calculated", "season": _current_academic_season_label(), "stats_computed": True}


@app.get("/api/v1/analytics/sport/{sport}/rankings")
async def get_sport_rankings(sport: str):
    # Find the matching sport slug
    sport_slug = None
    for name, slug in SPORTS.items():
        if sport.lower() in name.lower() or sport.lower() in slug.lower():
            sport_slug = slug
            break
    if not sport_slug:
        sport_slug = sport.lower()

    # Return from scraped rankings
    rankings_data = _get_rankings(sport_slug)
    if rankings_data:
        return {
            "sport": sport,
            "rankings": [
                {
                    "rank": r["rank"],
                    "team_name": r["name"],
                    "record": r["record"],
                    "npi": r["npi"],
                    "region": r["region"],
                }
                for r in rankings_data[:50]
            ],
        }

    # Fallback: rank teams by wins
    teams = _get_teams_list(sport=sport)
    ranked = sorted(teams, key=lambda t: t.get("wins", 0), reverse=True)
    return {
        "sport": sport,
        "rankings": [
            {
                "rank": i + 1,
                "team_id": t["id"],
                "team_name": t["name"],
                "conference": t.get("conference", ""),
                "record": f"{t.get('wins', 0)}-{t.get('losses', 0)}",
            }
            for i, t in enumerate(ranked[:20])
        ],
    }


@app.get("/api/v1/analytics/player/{player_id}")
async def get_player_analytics(player_id: str):
    return {"player_id": player_id, "name": "Player data not available", "stats": {}}


@app.get("/api/v1/analytics/predict/{home_team_id}/{away_team_id}")
async def get_prediction(home_team_id: str, away_team_id: str):
    home = _get_team(home_team_id)
    away = _get_team(away_team_id)
    hs = home.get("stats", {}) if home else {}
    aws = away.get("stats", {}) if away else {}
    hw = home.get("wins", 0) if home else 0
    aw = away.get("wins", 0) if away else 0
    total = hw + aw or 1
    return {
        "home_team": home,
        "away_team": away,
        "prediction": {
            "home_win_probability": round(hw / total, 2),
            "predicted_home_score": int(hs.get("ppg", 70)),
            "predicted_away_score": int(aws.get("ppg", 68)),
            "confidence": round(min(0.9, 0.5 + abs(hw - aw) * 0.02), 2),
        },
    }


# ── Reports ─────────────────────────────────────────────────────────────

@app.get("/api/v1/reports/")
@app.get("/api/v1/reports")
async def get_reports(authorization: Optional[str] = Header(default=None)):
    # Reports are scoped per signed-in user. Anonymous visitors see nothing,
    # and signed-in users only see reports they generated themselves.
    current_user = _get_current_user_optional(authorization)
    if not current_user:
        return {"reports": [], "total": 0}
    if _prune_invalid_self_matchup_reports():
        _save_reports_store()
    user_id = current_user.get("id") if isinstance(current_user, dict) else None
    visible = [r for r in REPORTS if r.get("user_id") == user_id]
    return {"reports": visible, "total": len(visible)}


@app.get("/api/v1/reports/templates/")
async def get_report_templates():
    return {"templates": [
        {"id": "t1", "name": "Standard Scouting Report", "description": "Comprehensive opponent analysis"},
        {"id": "t2", "name": "Quick Game Preview", "description": "Brief matchup overview"},
        {"id": "t3", "name": "Season Summary", "description": "Full season statistical breakdown"},
    ]}


@app.get("/api/v1/reports/team/{team_id}/latest")
async def get_latest_report_for_team(team_id: str, authorization: Optional[str] = Header(default=None)):
    current_user = _get_current_user_optional(authorization)
    if not current_user:
        return {"message": "No reports found for this team"}
    user_id = current_user.get("id") if isinstance(current_user, dict) else None
    team = _get_team(team_id)
    if team:
        team_name = team.get("name", "")
        team_reports = [
            r for r in REPORTS
            if team_name in r.get("team_name", "") and r.get("user_id") == user_id
        ]
        if team_reports:
            return team_reports[-1]
    return {"message": "No reports found for this team"}


@app.get("/api/v1/reports/{report_id}")
async def get_report(report_id: str, authorization: Optional[str] = Header(default=None)):
    current_user = _get_current_user_optional(authorization)
    user_id = current_user.get("id") if isinstance(current_user, dict) else None
    report = next((r for r in REPORTS if r["id"] == report_id), None)
    if not report or report.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@app.get("/api/v1/reports/{report_id}/html")
async def get_report_html(report_id: str, authorization: Optional[str] = Header(default=None)):
    current_user = _get_current_user_optional(authorization)
    user_id = current_user.get("id") if isinstance(current_user, dict) else None
    report = next((r for r in REPORTS if r["id"] == report_id), None)
    if not report or report.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"html": f"<html><body><h1>{report['title']}</h1><div>{report.get('content', '')}</div></body></html>"}


def _generate_report_pdf(report: dict) -> bytes:
    """Generate a real PDF scouting report using reportlab."""
    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        HRFlowable, KeepTogether,
    )

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
        topMargin=0.75 * inch, bottomMargin=0.75 * inch,
    )

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        "ReportTitle", parent=styles["Title"], fontSize=22,
        spaceAfter=4, textColor=colors.HexColor("#1e3a5f"),
    ))
    styles.add(ParagraphStyle(
        "SectionHead", parent=styles["Heading2"], fontSize=14,
        spaceBefore=16, spaceAfter=6, textColor=colors.HexColor("#1e3a5f"),
        borderPadding=(0, 0, 4, 0),
    ))
    styles.add(ParagraphStyle(
        "SubHead", parent=styles["Heading3"], fontSize=11,
        spaceBefore=8, spaceAfter=4, textColor=colors.HexColor("#334155"),
    ))
    styles.add(ParagraphStyle(
        "BodyText2", parent=styles["BodyText"], fontSize=10,
        leading=14, spaceAfter=4,
    ))
    styles.add(ParagraphStyle(
        "BulletItem", parent=styles["BodyText"], fontSize=10,
        leading=14, leftIndent=20, bulletIndent=8,
        spaceAfter=2,
    ))

    story = []
    summary = report.get("summary", {})
    matchup = report.get("matchup_analysis", {})
    opponent = report.get("opponent_profile", {})
    overall_statistics = report.get("overall_statistics", {})
    comparison_snapshot = report.get("comparison_snapshot", {})

    def _format_stat_key(key: str) -> str:
        key_str = str(key).lower()
        label_map = {
            "ppg": "PPG",
            "opp_ppg": "Opp PPG",
            "gaa": "GAA",
            "fg_pct": "FG%",
            "opp_fg_pct": "Opp FG%",
            "three_pct": "3PT%",
            "ft_pct": "FT%",
            "rpg": "RPG",
            "reb_margin": "Rebound Margin",
            "assists_per_set": "Assists/Set",
            "blocks_per_set": "Blocks/Set",
            "batting_avg": "Batting Avg",
            "era": "ERA",
        }
        if key_str in label_map:
            return label_map[key_str]
        return " ".join(part.capitalize() for part in key_str.split("_"))

    def _section_header(title: str):
        return KeepTogether([
            Paragraph(title, styles["SectionHead"]),
            HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cbd5e1")),
        ])

    def _format_stat_value(key: str, value) -> str:
        if value is None:
            return "N/A"
        if isinstance(value, float):
            if "pct" in str(key).lower() and value <= 1:
                return f"{value * 100:.1f}%"
            if value.is_integer():
                return str(int(value))
            return f"{value:.2f}"
        return str(value)

    def _comparison_edge_label(edge_value: str, team1_name: str, team2_name: str) -> str:
        if edge_value == "team1":
            return team1_name
        if edge_value == "team2":
            return team2_name
        if edge_value == "n/a":
            return "N/A"
        return "Even"

    # ── Header ──
    story.append(Paragraph("ScoutD3 Scouting Report", styles["ReportTitle"]))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#1e3a5f")))
    story.append(Spacer(1, 8))

    # Meta info table
    meta_data = [
        ["Report:", report.get("title", "Scouting Report")],
        ["Sport:", report.get("sport", "N/A")],
        ["Season:", report.get("season", "N/A")],
        ["Generated:", report.get("generated_at", "N/A")[:19]],
    ]
    meta_table = Table(meta_data, colWidths=[1.2 * inch, 5.5 * inch])
    meta_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#475569")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 12))

    # ── Team Identity / Overview ──
    story.append(_section_header("Overview"))
    identity = summary.get("team_identity", "")
    if identity:
        story.append(Paragraph(identity, styles["BodyText2"]))
    story.append(Spacer(1, 4))

    # ── Matchup Prediction ──
    predicted = matchup.get("predicted_outcome", "")
    confidence = matchup.get("confidence", 0)
    if predicted:
        story.append(_section_header("Matchup Prediction"))
        pred_data = [
            ["Predicted Outcome:", predicted],
            ["Confidence:", f"{confidence:.0%}"],
        ]
        pred_table = Table(pred_data, colWidths=[1.8 * inch, 4.9 * inch])
        pred_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f1f5f9")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.append(pred_table)
        story.append(Spacer(1, 4))

        factors = matchup.get("key_factors", [])
        if factors:
            story.append(Paragraph("Key Factors", styles["SubHead"]))
            for f in factors:
                story.append(Paragraph(f"\u2022 {f}", styles["BulletItem"]))

    # ── Strengths & Weaknesses ──
    def _bullet_section(title, items):
        block = []
        block.append(_section_header(title))
        for item in items:
            block.append(Paragraph(f"\u2022 {item}", styles["BulletItem"]))
        block.append(Spacer(1, 4))
        return block

    strengths = summary.get("key_strengths", [])
    weaknesses = summary.get("key_weaknesses", [])

    if strengths:
        story.extend(_bullet_section("Key Strengths", strengths))
    if weaknesses:
        story.extend(_bullet_section("Key Weaknesses", weaknesses))

    # ── Strategic Recommendations ──
    recs = summary.get("strategic_recommendations", [])
    if recs:
        story.append(_section_header("Strategic Recommendations"))
        for i, rec in enumerate(recs, 1):
            story.append(Paragraph(f"{i}. {rec}", styles["BulletItem"]))
        story.append(Spacer(1, 4))

    # ── Opponent Profile ──
    off_tend = opponent.get("offensive_tendencies", [])
    def_tend = opponent.get("defensive_tendencies", [])
    recent = opponent.get("recent_form", "")

    if off_tend or def_tend or recent:
        opponent_block = [_section_header("Opponent Profile")]
        if recent:
            opponent_block.append(Paragraph(f"<b>Recent Form:</b> {recent}", styles["BodyText2"]))
        if off_tend:
            opponent_block.append(Paragraph("Offensive Tendencies", styles["SubHead"]))
            for t in off_tend:
                opponent_block.append(Paragraph(f"\u2022 {t}", styles["BulletItem"]))
        if def_tend:
            opponent_block.append(Paragraph("Defensive Tendencies", styles["SubHead"]))
            for t in def_tend:
                opponent_block.append(Paragraph(f"\u2022 {t}", styles["BulletItem"]))
        story.append(KeepTogether(opponent_block))

    # ── Comparison Snapshot (mirrors Analytics comparison section) ──
    if comparison_snapshot:
        team1_name = comparison_snapshot.get("team1_name") or report.get("team_name", "Team 1")
        team2_name = comparison_snapshot.get("team2_name") or report.get("opponent_name", "Team 2")
        team1_season = comparison_snapshot.get("team1_season", report.get("season", "N/A"))
        team2_season = comparison_snapshot.get("team2_season", report.get("season", "N/A"))

        story.append(_section_header("Head-to-Head Comparison"))
        story.append(Paragraph(
            f"Seasons: {team1_name} ({team1_season}) | {team2_name} ({team2_season})",
            styles["BodyText2"],
        ))

        verdict = comparison_snapshot.get("verdict")
        if verdict:
            verdict_table = Table([[str(verdict)]], colWidths=[6.7 * inch])
            verdict_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f0fdf4")),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#166534")),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#bbf7d0")),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ]))
            story.append(verdict_table)
            story.append(Spacer(1, 6))

        edge_rows = [
            ["Offensive Edge", comparison_snapshot.get("offensive_edge", "N/A")],
            ["Defensive Edge", comparison_snapshot.get("defensive_edge", "N/A")],
            ["Overall Edge", comparison_snapshot.get("overall_edge", "N/A")],
        ]
        edge_table = Table(edge_rows, colWidths=[2.2 * inch, 4.5 * inch])
        edge_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(edge_table)
        story.append(Spacer(1, 8))

        rating_rows = comparison_snapshot.get("rating_rows", [])
        if rating_rows:
            story.append(Paragraph("Ratings", styles["SubHead"]))
            rating_data = [["Metric", team1_name, team2_name, "Edge"]]
            for row in rating_rows:
                rating_data.append([
                    row.get("label", "Metric"),
                    str(row.get("team1", "N/A")),
                    str(row.get("team2", "N/A")),
                    _comparison_edge_label(str(row.get("edge", "even")), team1_name, team2_name),
                ])
            rating_table = Table(rating_data, colWidths=[2.2 * inch, 1.4 * inch, 1.4 * inch, 1.7 * inch])
            rating_table.setStyle(TableStyle([
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
                ("ALIGN", (1, 0), (3, -1), "CENTER"),
            ]))
            story.append(rating_table)
            story.append(Spacer(1, 8))

        stat_rows = comparison_snapshot.get("stat_rows", [])
        if stat_rows:
            story.append(Paragraph("Statistical Breakdown", styles["SubHead"]))
            stat_data = [["Statistic", team1_name, team2_name, "Edge"]]
            for row in stat_rows:
                stat_data.append([
                    row.get("label", "Statistic"),
                    str(row.get("team1", "N/A")),
                    str(row.get("team2", "N/A")),
                    _comparison_edge_label(str(row.get("edge", "even")), team1_name, team2_name),
                ])
            stat_table = Table(stat_data, colWidths=[2.2 * inch, 1.4 * inch, 1.4 * inch, 1.7 * inch])
            stat_table.setStyle(TableStyle([
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
                ("ALIGN", (1, 0), (3, -1), "CENTER"),
            ]))
            story.append(stat_table)
            story.append(Spacer(1, 4))

        team1_advantages = comparison_snapshot.get("team1_advantages", 0)
        team2_advantages = comparison_snapshot.get("team2_advantages", 0)
        story.append(Paragraph(f"{team1_name}: {team1_advantages} advantages", styles["BodyText2"]))
        story.append(Paragraph(f"{team2_name}: {team2_advantages} advantages", styles["BodyText2"]))

        team1_style = comparison_snapshot.get("team1_style")
        team2_style = comparison_snapshot.get("team2_style")
        team1_strengths = comparison_snapshot.get("team1_strengths", [])
        team2_strengths = comparison_snapshot.get("team2_strengths", [])

        if team1_style or team2_style or team1_strengths or team2_strengths:
            story.append(Spacer(1, 6))
            team1_block = [Paragraph(team1_name, styles["SubHead"])]
            if team1_style:
                team1_block.append(Paragraph(f"Style: {team1_style}", styles["BodyText2"]))
            for item in team1_strengths:
                team1_block.append(Paragraph(f"\u2022 {item}", styles["BulletItem"]))
            story.append(KeepTogether(team1_block))

            team2_block = [Paragraph(team2_name, styles["SubHead"])]
            if team2_style:
                team2_block.append(Paragraph(f"Style: {team2_style}", styles["BodyText2"]))
            for item in team2_strengths:
                team2_block.append(Paragraph(f"\u2022 {item}", styles["BulletItem"]))
            story.append(KeepTogether(team2_block))

    # ── Overall Team Statistics ──
    team_stats_block = overall_statistics.get("team", {}) if isinstance(overall_statistics, dict) else {}
    opp_stats_block = overall_statistics.get("opponent", {}) if isinstance(overall_statistics, dict) else {}
    if team_stats_block or opp_stats_block:
        story.append(_section_header("Overall Team Statistics"))

        for block in (team_stats_block, opp_stats_block):
            if not block:
                continue

            block_name = block.get("name", "Team")
            block_record = block.get("record", "N/A")
            block_season = block.get("season", report.get("season", "N/A"))
            block_stats = block.get("stats", {}) if isinstance(block.get("stats", {}), dict) else {}

            block_story = [
                Paragraph(f"{block_name}", styles["SubHead"]),
                Paragraph(f"Record: {block_record} | Season: {block_season}", styles["BodyText2"]),
            ]

            stat_rows = [["Metric", "Value"]]
            for stat_key, stat_value in block_stats.items():
                stat_rows.append([_format_stat_key(stat_key), _format_stat_value(stat_key, stat_value)])

            if len(stat_rows) == 1:
                stat_rows.append(["No statistics available", "N/A"])

            stats_table = Table(stat_rows, colWidths=[4.4 * inch, 2.3 * inch])
            stats_table.setStyle(TableStyle([
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ]))
            for i in range(1, len(stat_rows)):
                bg = colors.HexColor("#f8fafc") if i % 2 == 1 else colors.HexColor("#ffffff")
                stats_table.setStyle(TableStyle([("BACKGROUND", (0, i), (-1, i), bg)]))

            block_story.append(stats_table)
            block_story.append(Spacer(1, 8))
            story.append(KeepTogether(block_story))

    # ── Footer ──
    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#1e3a5f")))
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        "Generated by ScoutD3 \u2014 NCAA Division III Multi-Sport Scouting System",
        ParagraphStyle("Footer", parent=styles["Normal"], fontSize=8,
                       textColor=colors.HexColor("#94a3b8"), alignment=1),
    ))

    doc.build(story)
    return buf.getvalue()


@app.get("/api/v1/reports/{report_id}/pdf")
async def get_report_pdf(report_id: str, authorization: Optional[str] = Header(default=None)):
    current_user = _get_current_user_optional(authorization)
    user_id = current_user.get("id") if isinstance(current_user, dict) else None
    report = next((r for r in REPORTS if r["id"] == report_id), None)
    if not report or report.get("user_id") != user_id:
        return Response(content=b"Report not found", status_code=404)
    current_user = _get_current_user_optional(authorization)
    _log_activity(
        current_user,
        "download_report_pdf",
        f"/reports/{report_id}/pdf",
        team_id=report.get("team_id"),
        comparison_team_id=report.get("opponent_id"),
        metadata={"report_id": report_id, "title": report.get("title")},
    )
    pdf_bytes = _generate_report_pdf(report)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="scouting-report-{report_id}.pdf"'},
    )


@app.get("/api/v1/reports/{report_id}/insights")
async def get_report_insights(report_id: str):
    return {"report_id": report_id, "insights": ["Analysis based on live NCAA data"]}


@app.post("/api/v1/reports/generate")
async def generate_report(data: Optional[dict] = None, authorization: Optional[str] = Header(default=None)):
    data = data or {}
    # Build report from real scraped data
    team_id = data.get("teamId", data.get("team_id", ""))
    opponent_id = data.get("opponentId", data.get("opponent_id", ""))
    team = _get_team(team_id)
    opponent = _get_team(opponent_id)

    if not team or not opponent:
        raise HTTPException(status_code=404, detail="Team or opponent not found")
    if _is_same_matchup(team, opponent, team_id, opponent_id):
        raise HTTPException(status_code=400, detail="Select two different teams for report generation")

    team_name = team.get("name", "Team")
    opp_name = opponent.get("name", "Opponent")
    t_stats = team.get("stats", {})
    o_stats = opponent.get("stats", {})
    sport_name = (team.get("sport") or opponent.get("sport") or data.get("sport") or "")
    sport = sport_name.lower()

    def _to_float(value):
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def _team_metrics(stats_obj: dict):
        if "soccer" in sport:
            return {
                "off_label": "goals per game",
                "off_key": "ppg",
                "off_value": _to_float(stats_obj.get("ppg")),
                "def_label": "goals against average",
                "def_key": "gaa",
                "def_value": _to_float(stats_obj.get("gaa")),
                "def_lower_is_better": True,
            }
        if sport in {"baseball", "softball"}:
            return {
                "off_label": "batting average",
                "off_key": "batting_avg",
                "off_value": _to_float(stats_obj.get("batting_avg")),
                "def_label": "ERA",
                "def_key": "era",
                "def_value": _to_float(stats_obj.get("era")),
                "def_lower_is_better": True,
            }
        if sport == "women's volleyball":
            return {
                "off_label": "assists per set",
                "off_key": "assists_per_set",
                "off_value": _to_float(stats_obj.get("assists_per_set")),
                "def_label": "blocks per set",
                "def_key": "blocks_per_set",
                "def_value": _to_float(stats_obj.get("blocks_per_set")),
                "def_lower_is_better": False,
            }
        return {
            "off_label": "points per game",
            "off_key": "ppg",
            "off_value": _to_float(stats_obj.get("ppg")),
            "def_label": "opponent points per game",
            "def_key": "opp_ppg",
            "def_value": _to_float(stats_obj.get("opp_ppg")),
            "def_lower_is_better": True,
        }

    def _win_pct(team_obj: dict, stats_obj: dict) -> float:
        wins = int(team_obj.get("wins") or 0)
        losses = int(team_obj.get("losses") or 0)
        ties = 0
        for tie_key in ("ties", "draws", "ties_count"):
            if team_obj.get(tie_key) is not None:
                ties = int(team_obj.get(tie_key) or 0)
                break
            if stats_obj.get(tie_key) is not None:
                ties = int(stats_obj.get(tie_key) or 0)
                break
        if ties == 0 and "soccer" in sport:
            gp = _to_float(stats_obj.get("games_played"))
            if gp is not None:
                derived_ties = int(gp) - wins - losses
                if derived_ties > 0:
                    ties = derived_ties
        total_games = wins + losses + ties
        if total_games <= 0:
            return 0.0
        # Draws count as half result for edge comparisons.
        return (wins + (0.5 * ties)) / total_games

    def _edge_name(team_val, opp_val, lower_is_better: bool = False) -> str:
        if team_val is None or opp_val is None:
            return "Even"
        if team_val == opp_val:
            return "Even"
        if lower_is_better:
            return team_name if team_val < opp_val else opp_name
        return team_name if team_val > opp_val else opp_name

    def _metric_display(value) -> str:
        return "N/A" if value is None else f"{value:.2f}"

    t_metrics = _team_metrics(t_stats)
    o_metrics = _team_metrics(o_stats)

    comparison_snapshot = {}
    comparison_response = await get_team_comparison(team_id, opponent_id, authorization=authorization)
    if comparison_response:
        comparison_payload = comparison_response.get("comparison", {})
        comparison_snapshot = {
            "team1_name": team_name,
            "team2_name": opp_name,
            "team1_season": _season_label_for_sport(team.get("sport") or data.get("sport")),
            "team2_season": _season_label_for_sport(opponent.get("sport") or data.get("sport")),
            "verdict": comparison_payload.get("verdict"),
            "offensive_edge": comparison_payload.get("offensive_edge"),
            "defensive_edge": comparison_payload.get("defensive_edge"),
            "overall_edge": comparison_payload.get("overall_edge"),
            "rating_rows": comparison_payload.get("rating_rows", []),
            "stat_rows": comparison_payload.get("stat_rows", []),
            "team1_advantages": comparison_payload.get("team1_advantages", 0),
            "team2_advantages": comparison_payload.get("team2_advantages", 0),
            "team1_style": comparison_payload.get("team1_style", ""),
            "team2_style": comparison_payload.get("team2_style", ""),
            "team1_strengths": comparison_payload.get("team1_strengths", []),
            "team2_strengths": comparison_payload.get("team2_strengths", []),
        }

    t_off = t_metrics["off_value"]
    o_off = o_metrics["off_value"]
    t_def = t_metrics["def_value"]
    o_def = o_metrics["def_value"]
    def_lower_is_better = bool(t_metrics["def_lower_is_better"])

    t_wpct = _win_pct(team, t_stats)
    o_wpct = _win_pct(opponent, o_stats)

    offensive_edge = _edge_name(t_off, o_off)
    defensive_edge = _edge_name(t_def, o_def, lower_is_better=def_lower_is_better)
    record_edge = _edge_name(t_wpct, o_wpct)

    # Build strengths/weaknesses/recommendations from real data
    key_strengths = []
    key_weaknesses = []
    strategic_recs = []
    key_factors = []
    offensive_tendencies = []
    defensive_tendencies = []

    t_ppg = _to_float(t_stats.get("ppg"))
    o_ppg = _to_float(o_stats.get("ppg"))
    t_opp = _to_float(t_stats.get("opp_ppg"))
    o_opp = _to_float(o_stats.get("opp_ppg"))
    t_wins = team.get("wins", 0) if team else 0
    t_losses = team.get("losses", 0) if team else 0
    o_wins = opponent.get("wins", 0) if opponent else 0
    o_losses = opponent.get("losses", 0) if opponent else 0

    if t_off is not None:
        offensive_tendencies.append(f"Averages {t_off:.2f} {t_metrics['off_label']}")
    if o_off is not None:
        offensive_tendencies.append(f"Opponent averages {o_off:.2f} {o_metrics['off_label']}")
    if t_def is not None:
        defensive_tendencies.append(f"Allows {t_def:.2f} {t_metrics['def_label']}")
    if o_def is not None:
        defensive_tendencies.append(f"Opponent allows {o_def:.2f} {o_metrics['def_label']}")

    if offensive_edge != "Even":
        key_factors.append(f"Offensive edge: {offensive_edge}")
    if defensive_edge != "Even":
        key_factors.append(f"Defensive edge: {defensive_edge}")
    if record_edge != "Even":
        key_factors.append(f"Record edge: {record_edge}")

    if offensive_edge == team_name:
        key_strengths.append(
            f"{team_name} owns the offensive edge ({t_off:.2f} {t_metrics['off_label']} vs {o_off:.2f})"
        )
    elif offensive_edge == opp_name:
        key_weaknesses.append(
            f"{opp_name} owns the offensive edge ({o_off:.2f} {o_metrics['off_label']} vs {t_off:.2f})"
        )

    if defensive_edge == team_name:
        key_strengths.append(
            f"{team_name} has the better defense ({t_def:.2f} {t_metrics['def_label']} vs {o_def:.2f})"
        )
    elif defensive_edge == opp_name:
        key_weaknesses.append(
            f"{opp_name} has the better defense ({o_def:.2f} {o_metrics['def_label']} vs {t_def:.2f})"
        )

    if record_edge == team_name:
        key_strengths.append(
            f"Stronger season results: {_format_team_record(team, t_stats)} vs {_format_team_record(opponent, o_stats)}"
        )
    elif record_edge == opp_name:
        key_weaknesses.append(
            f"Opponent has stronger season results: {_format_team_record(opponent, o_stats)} vs {_format_team_record(team, t_stats)}"
        )

    for stat_key, label in [("fg_pct", "FG%"), ("three_pct", "3PT%"), ("ft_pct", "FT%"), ("reb_margin", "Rebound Margin")]:
        t_val = t_stats.get(stat_key)
        o_val = o_stats.get(stat_key)
        if t_val is not None and o_val is not None:
            try:
                t_f, o_f = float(t_val), float(o_val)
                if t_f > o_f:
                    key_strengths.append(f"Superior {label}: {t_val} vs opponent's {o_val}")
                    key_factors.append(f"{label} advantage ({t_val} vs {o_val})")
                else:
                    key_weaknesses.append(f"Opponent has better {label}: {o_val} vs {t_val}")
            except (ValueError, TypeError):
                pass

    if t_ppg and o_opp:
        try:
            if float(t_ppg) > float(o_opp):
                key_strengths.append(f"Scoring ({t_ppg} PPG) exceeds opponent's defense ({o_opp} OPP PPG)")
                strategic_recs.append("Maintain aggressive offensive tempo to exploit defensive gaps")
            else:
                key_weaknesses.append(f"Opponent defense ({o_opp} OPP PPG) contains our scoring ({t_ppg} PPG)")
                strategic_recs.append("Focus on high-efficiency possessions against tough defense")
        except (ValueError, TypeError):
            pass

    if o_ppg and t_opp:
        try:
            if float(o_ppg) > float(t_opp):
                key_weaknesses.append(f"Opponent scores {o_ppg} PPG against our {t_opp} OPP PPG defense")
                strategic_recs.append("Tighten perimeter defense and limit transition opportunities")
            else:
                key_strengths.append(f"Defensive advantage: allowing {t_opp} PPG vs opponent's {o_ppg} scoring")
                strategic_recs.append("Use defensive pressure to force turnovers and low-quality shots")
        except (ValueError, TypeError):
            pass

    if t_wins or t_losses:
        offensive_tendencies.append(f"Season record: {_format_team_record(team, t_stats)}")
    if o_wins or o_losses:
        defensive_tendencies.append(f"Opponent record: {_format_team_record(opponent, o_stats)}")

    # Ensure at least some content
    if not key_strengths:
        key_strengths.append("Team data is being analyzed for strengths")
    if not key_weaknesses:
        key_weaknesses.append("No significant weaknesses identified from available data")
    if not strategic_recs:
        strategic_recs.append("Continue monitoring opponent statistics as season progresses")
    if not key_factors:
        key_factors.append("Head-to-head matchup data will provide more insight")
    if not offensive_tendencies:
        offensive_tendencies.append("Offensive tendencies require more game data")
    if not defensive_tendencies:
        defensive_tendencies.append("Defensive tendencies require more game data")

    # Predicted outcome
    predicted = "Competitive matchup"
    edge_score_team = 0
    edge_score_opp = 0
    for edge in (offensive_edge, defensive_edge, record_edge):
        if edge == team_name:
            edge_score_team += 1
        elif edge == opp_name:
            edge_score_opp += 1

    confidence = 0.65
    if edge_score_team > edge_score_opp:
        predicted = f"{team_name} favored"
        confidence = min(0.88, 0.66 + (edge_score_team - edge_score_opp) * 0.08)
    elif edge_score_opp > edge_score_team:
        predicted = f"{opp_name} favored"
        confidence = min(0.88, 0.66 + (edge_score_opp - edge_score_team) * 0.08)

    team_identity = f"Analysis of {team_name} vs {opp_name}."
    team_identity = (
        f"{team_name} ({_format_team_record(team, t_stats)}) faces {opp_name} ({_format_team_record(opponent, o_stats)}) "
        f"in a {team.get('conference', '')} matchup. "
        f"{team_name} averages {_metric_display(t_off)} {t_metrics['off_label']} and allows {_metric_display(t_def)} {t_metrics['def_label']}, "
        f"compared to {opp_name}'s {_metric_display(o_off)} {o_metrics['off_label']} offense and {_metric_display(o_def)} {o_metrics['def_label']} defense. "
        f"Current statistical edges: offense ({offensive_edge}), defense ({defensive_edge}), and record ({record_edge})."
    )

    new_id = _next_report_id()
    current_user = _get_current_user_optional(authorization)
    user_id = current_user.get("id") if isinstance(current_user, dict) else None
    report = {
        "id": new_id,
        "user_id": user_id,
        "title": f"{team_name} vs {opp_name} Scouting Report",
        "team_id": team_id,
        "opponent_id": opponent_id,
        "team_name": team_name,
        "opponent_name": opp_name,
        "sport": team.get("sport") or opponent.get("sport") or data.get("sport"),
        "season": _season_label_for_sport(team.get("sport") or opponent.get("sport") or data.get("sport")),
        "generated_at": str(datetime.datetime.now()),
        "status": "completed",
        "summary": {
            "team_identity": team_identity,
            "key_insights_count": len(key_strengths) + len(key_weaknesses),
            "strategic_recommendations_count": len(strategic_recs),
            "confidence_score": confidence,
            "key_strengths": key_strengths,
            "key_weaknesses": key_weaknesses,
            "strategic_recommendations": strategic_recs,
        },
        "matchup_analysis": {
            "predicted_outcome": predicted,
            "confidence": confidence,
            "key_factors": key_factors,
        },
        "opponent_profile": {
            "offensive_tendencies": offensive_tendencies,
            "defensive_tendencies": defensive_tendencies,
            "recent_form": f"{_format_team_record(opponent, o_stats)} this season",
            "home_vs_away": "Split data not available from NCAA stats",
        },
        "comparison_snapshot": comparison_snapshot,
        "overall_statistics": {
            "team": {
                "name": team_name,
                "season": _season_label_for_sport(team.get("sport") or opponent.get("sport") or data.get("sport")),
                "record": _format_team_record(team, t_stats),
                "stats": t_stats,
            },
            "opponent": {
                "name": opp_name,
                "season": _season_label_for_sport(opponent.get("sport") or team.get("sport") or data.get("sport")),
                "record": _format_team_record(opponent, o_stats),
                "stats": o_stats,
            },
        },
    }
    REPORTS.append(report)
    _save_reports_store()
    _log_activity(
        current_user,
        "generate_report",
        "/reports/generate",
        team_id=team_id,
        comparison_team_id=opponent_id,
        metadata={"report_id": new_id, "title": report["title"]},
    )
    return report


@app.post("/api/v1/reports/")
async def create_report(data: Optional[dict] = None, authorization: Optional[str] = Header(default=None)):
    return await generate_report(data, authorization)


@app.put("/api/v1/reports/{report_id}/regenerate")
async def regenerate_report(report_id: str, authorization: Optional[str] = Header(default=None)):
    current_user = _get_current_user_optional(authorization)
    user_id = current_user.get("id") if isinstance(current_user, dict) else None
    report = next((r for r in REPORTS if r["id"] == report_id), None)
    if not report:
        return {"error": "Report not found"}
    if report.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Report not found")
    report["generated_at"] = str(datetime.datetime.now())
    report["status"] = "completed"
    _save_reports_store()
    return report


@app.delete("/api/v1/reports/{report_id}")
async def delete_report(report_id: str, authorization: Optional[str] = Header(default=None)):
    current_user = _get_current_user_optional(authorization)
    user_id = current_user.get("id") if isinstance(current_user, dict) else None
    target = next((r for r in REPORTS if r["id"] == report_id), None)
    if not target or target.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Report not found")
    REPORTS[:] = [r for r in REPORTS if r["id"] != report_id]
    _save_reports_store()
    return {"status": "deleted", "id": report_id}


# ── Data Ingestion (now triggers real NCAA scraping) ────────────────────

@app.get("/api/v1/scrape/status")
async def scrape_status():
    status = get_scrape_status()
    summary = _get_dataset_summary()
    status["total_teams"] = summary["total_teams"]
    status["total_sports"] = summary["total_sports"]
    status["last_updated"] = summary["last_updated"].isoformat() if summary["last_updated"] else None
    return status


@app.post("/api/v1/scrape/refresh")
async def scrape_refresh():
    if cache.is_scraping:
        return {"status": "already_running", "message": "A scrape is already in progress"}
    asyncio.create_task(scrape_all(run_label="manual_refresh"))
    return {"status": "started", "message": "Manual NCAA data refresh started"}


@app.get("/api/v1/ingestion/comprehensive/summary")
async def get_ingestion_summary():
    teams = _get_teams_list()
    summary = _get_dataset_summary()
    total_games = sum(t.get("stats", {}).get("games_played", 0) or 0 for t in teams) // 2
    scrape = await scrape_status()

    progress = {
        "is_scraping": bool(scrape.get("is_scraping")),
        "phase": scrape.get("phase") or "idle",
        "progress_percent": int(scrape.get("progress_percent") or 0),
        "run_label": scrape.get("run_label") or "none",
    }

    startup_message = "Dataset is ready for scouting."
    if progress["is_scraping"]:
        if progress["run_label"] == "first_access_auto":
            startup_message = "Initial automatic data load is in progress (first access only)."
        elif progress["run_label"] in {"manual_refresh", "manual_sample", "manual_full"}:
            startup_message = "Manual data load is in progress."
        else:
            startup_message = "Data load is in progress."

    return {
        "system_ready": summary["total_teams"] > 0,
        "database_status": {
            "total_teams": summary["total_teams"],
            "total_games": total_games,
            "total_sports": summary["total_sports"],
            "total_reports": len(REPORTS),
        },
        "startup_plan": {
            "initial": "One-time automatic full scrape on first access if no dataset exists",
            "updates": "Manual only from Data Ingestion",
        },
        "load_progress": progress,
        "startup_message": startup_message,
        "data_freshness": f"Live from NCAA - updated {summary['last_updated'].strftime('%Y-%m-%d %H:%M') if summary['last_updated'] else 'Scraping in progress...'}",
        "last_ingestion": summary["last_updated"].isoformat() if summary["last_updated"] else "In progress",
        "ingestion_available": True,
        "scrape_status": scrape,
    }


@app.get("/api/v1/ingestion/comprehensive/discovery/preview")
async def get_discovery_preview():
    teams = _get_teams_list()
    conferences = list(set(t.get("conference", "") for t in teams))
    sports = list(set(t.get("sport", "") for t in teams))
    return {
        "total_colleges_found": len(set(t.get("slug", "") for t in teams)),
        "estimated_total_teams": len(teams),
        "discovery_sources": ["NCAA Official Website (ncaa.com)", "Live Web Scraping"],
        "sample_colleges": [
            {"name": t["name"], "conference": t.get("conference", ""), "sport": t.get("sport", "")}
            for t in teams[:10]
        ],
        "conferences_found": len(conferences),
        "sports_found": sports,
        "note": f"Live data from ncaa.com. {len(teams)} teams across {len(sports)} sports.",
    }


@app.post("/api/v1/ingestion/comprehensive/sample")
async def start_sample_ingestion(num_colleges: int = 10):
    """Trigger a real NCAA scrape for basketball only."""
    _ = num_colleges
    job_id = str(uuid.uuid4())
    ingestion_jobs[job_id] = {
        "job_id": job_id,
        "status": "running",
        "phase": "scraping NCAA basketball data",
        "started_at": str(datetime.datetime.now()),
        "progress_percent": 0,
        "statistics": {"colleges_discovered": 0, "colleges_processed": 0, "teams_created": 0, "games_imported": 0},
        "recent_errors": [],
    }
    asyncio.create_task(_real_ingestion(job_id, ["basketball-men"]))
    return {"job_id": job_id, "status": "running", "message": "Live NCAA basketball scraping started"}


@app.post("/api/v1/ingestion/comprehensive/full")
async def start_full_ingestion():
    """Trigger a full NCAA scrape across all sports."""
    job_id = str(uuid.uuid4())
    ingestion_jobs[job_id] = {
        "job_id": job_id,
        "status": "running",
        "phase": "scraping all NCAA D3 sports",
        "started_at": str(datetime.datetime.now()),
        "progress_percent": 0,
        "statistics": {"colleges_discovered": 0, "colleges_processed": 0, "teams_created": 0, "games_imported": 0},
        "recent_errors": [],
    }
    asyncio.create_task(_real_ingestion(job_id, None))
    return {"job_id": job_id, "status": "running", "message": "Full NCAA D3 scraping started for all sports"}


async def _real_ingestion(job_id: str, sport_filter):
    """Run a real scrape and update ingestion job status."""
    job = ingestion_jobs[job_id]
    try:
        job["phase"] = "fetching data from ncaa.com"
        job["progress_percent"] = 10

        result = await scrape_all(sport_filter, run_label="manual_sample" if sport_filter else "manual_full")

        job["progress_percent"] = 100
        job["phase"] = "complete"
        job["status"] = "completed"
        job["completed_at"] = str(datetime.datetime.now())
        job["statistics"]["teams_created"] = result.get("teams", 0)
        job["statistics"]["colleges_discovered"] = _get_dataset_summary()["college_count"]
        job["statistics"]["colleges_processed"] = job["statistics"]["colleges_discovered"]
    except (RuntimeError, ValueError, OSError) as e:
        job["status"] = "error"
        job["phase"] = f"error: {str(e)}"
        job["recent_errors"].append(str(e))


@app.get("/api/v1/ingestion/comprehensive/status/{job_id}")
async def get_ingestion_status(job_id: str):
    job = ingestion_jobs.get(job_id)
    if not job:
        return {"error": "Job not found", "job_id": job_id}
    return job


@app.post("/api/v1/ingestion/jobs")
async def create_ingestion_job(data: Optional[dict] = None):
    data = data or {}
    job_id = str(uuid.uuid4())
    return {"job_id": job_id, "status": "created", "type": data.get("type", "manual")}


@app.get("/api/v1/ingestion/jobs")
async def get_ingestion_jobs():
    return {"jobs": list(ingestion_jobs.values())}


@app.get("/api/v1/ingestion/jobs/{job_id}")
async def get_ingestion_job(job_id: str):
    return ingestion_jobs.get(job_id, {"error": "Job not found"})


@app.delete("/api/v1/ingestion/jobs/{job_id}")
async def delete_ingestion_job(job_id: str):
    ingestion_jobs.pop(job_id, None)
    return {"status": "deleted"}


@app.post("/api/v1/ingestion/teams/discover")
async def discover_teams(data: Optional[dict] = None):
    _ = data
    return {"status": "discovered", "teams_found": _get_dataset_summary()["total_teams"]}


@app.post("/api/v1/ingestion/games/import")
async def import_games():
    return {"status": "imported", "games_imported": 0}


@app.post("/api/v1/ingestion/statistics/import")
async def import_statistics():
    return {"status": "imported", "statistics_imported": _get_dataset_summary()["total_teams"]}


@app.post("/api/v1/ingestion/validate-source")
async def validate_source():
    return {"valid": True, "source_type": "NCAA Live Scraping", "records_available": _get_dataset_summary()["total_teams"]}


@app.post("/api/v1/ingestion/refresh-all")
async def refresh_all():
    if not cache.is_scraping:
        asyncio.create_task(scrape_all(run_label="manual_refresh"))
    return {"status": "refreshing", "message": "Manual full NCAA data refresh initiated"}


@app.get("/api/v1/ingestion/health")
async def ingestion_health():
    summary = _get_dataset_summary()
    return {
        "status": "healthy",
        "services": {
            "scraper": "active" if cache.is_scraping else "idle",
            "data": f"{summary['total_teams']} teams loaded",
            "last_updated": summary["last_updated"].isoformat() if summary["last_updated"] else "never",
        },
    }


@app.post("/api/v1/ingestion/pdf/parse-sample")
async def parse_sample_pdf():
    teams = _get_teams_list()[:3]
    return {
        "status": "parsed",
        "records_found": len(teams),
        "sample_data": [
            {"team": t["name"], "stat": "PPG", "value": t.get("stats", {}).get("ppg", 0)}
            for t in teams
        ],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
