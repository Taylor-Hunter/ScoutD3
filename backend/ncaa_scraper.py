"""
NCAA Division III Live Data Scraper
Fetches real team stats, rankings from ncaa.com
"""

import httpx
from bs4 import BeautifulSoup
import asyncio
import datetime
import json
from json import JSONDecodeError
import os
import re
import logging
from pathlib import Path
from typing import Dict, List, Optional, Any

from postgres_store import persist_scrape_result

logger = logging.getLogger("ncaa_scraper")

CACHE_SNAPSHOT_PATH = Path(
    os.getenv(
        "NCAA_CACHE_FILE",
        str(Path(__file__).resolve().parent / "data" / "ncaa_cache.json"),
    )
)

NCAA_BASE = "https://www.ncaa.com"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

# ── Sport Configuration ─────────────────────────────────────────────────

SPORTS = {
    "Men's Basketball": "basketball-men",
    "Women's Basketball": "basketball-women",
    "Baseball": "baseball",
    "Softball": "softball",
    "Men's Soccer": "soccer-men",
    "Women's Soccer": "soccer-women",
    "Women's Volleyball": "volleyball-women",
}

# Known conference fallbacks when NCAA school pages omit conference metadata.
# Keep keys as lowercase school slugs.
CONFERENCE_OVERRIDES_BY_SLUG: Dict[str, str] = {
    "alverno": "Northern Athletics Collegiate Conference",
    "brockport": "Empire 8 Conference",
    "carlow": "Allegheny Mountain Collegiate Conference",
    "cedar-crest": "United East Conference",
    "bryn-mawr": "Centennial Conference",
    "hollins": "Old Dominion Athletic Conference",
    "maranatha-baptist": "Northern Athletics Collegiate Conference",
    "morrisville-st": "State University of New York Athletic Conference",
    "mount-holyoke": "New England Women's and Men's Athletic Conference",
    "muw": "St. Louis Intercollegiate Athletic Conference",
    "peace": "USA South Athletic Conference",
    "smith": "New England Women's and Men's Athletic Conference",
    "st-benedict": "Minnesota Intercollegiate Athletic Conference",
    "st-catherine": "Minnesota Intercollegiate Athletic Conference",
    "sweet-briar": "Old Dominion Athletic Conference",
    "wellesley": "New England Women's and Men's Athletic Conference",
    "wesleyan-ga": "Collegiate Conference of the South",
}

# Verified stat page IDs for D3 sports (from ncaa.com)
SPORT_STAT_IDS = {
    "basketball-men": {
        "winning_pct": 168,       # Rank, Team, W, L, PCT
        "scoring_offense": 145,   # Rank, Team, GM, PTS, PPG
        "scoring_defense": 146,   # Rank, Team, GM, OPP PTS, OPP PPG
        "field_goal_pct": 148,    # Rank, Team, GM, FGM, FGA, FG%
        "opp_field_goal_pct": 149,# Rank, Team, GM, OPP FG, OPP FGA, OPP FG%
        "free_throw_pct": 150,    # Rank, Team, GM, FT, FTA, FT%
        "rebounds": 151,          # Rank, Team, GM, REB, RPG, OPP REB, OPP RPG, REB MAR
        "three_point_pct": 152,   # Rank, Team, GM, 3FG, 3FGA, 3FG%
    },
    "basketball-women": {
        "winning_pct": 169,       # Rank, Team, W, L, PCT
        "scoring_offense": 111,   # Rank, Team, GM, PTS, PPG
        "scoring_defense": 112,   # Rank, Team, GM, OPP PTS, OPP PPG
        "field_goal_pct": 114,    # Rank, Team, GM, FGM, FGA, FG%
        "opp_field_goal_pct": 115,# Rank, Team, GM, OPP FG, OPP FGA, OPP FG%
        "free_throw_pct": 116,    # Rank, Team, GM, FT, FTA, FT%
        "rebounds": 117,          # Rank, Team, GM, REB, RPG, OPP REB, OPP RPG, REB MAR
        "three_point_pct": 118,   # Rank, Team, GM, 3FG, 3FGA, 3FG%
    },
    "baseball": {
        "winning_pct": 319,       # Rank, Team, W, L, T, PCT
        "batting_average": 210,   # Rank, Team, G, AB, H, BA
        "earned_run_avg": 211,    # Rank, Team, G, IP, ER, ERA
    },
    "softball": {
        "winning_pct": 320,       # Rank, Team, W, L, T, PCT
        "batting_average": 281,   # Rank, Team, G, AB, H, BA
        "earned_run_avg": 282,    # Rank, Team, G, IP, ER, ERA
    },
    "soccer-men": {
        "winning_pct": 33,        # Rank, Team, Won, Loss, Tied, Pct.
        "scoring_offense": 30,    # Rank, Team, Games, Goals, Per Game
        "goals_against_avg": 32,  # Rank, Team, Games, GA, GAA
    },
    "soccer-women": {
        "winning_pct": 60,        # Rank, Team, Won, Loss, Tied, Pct.
        "scoring_offense": 56,    # Rank, Team, Games, Goals, Per Game
        "goals_against_avg": 58,  # Rank, Team, Games, GA, GAA
    },
    "volleyball-women": {
        "winning_pct": 51,        # Rank, Team, W, L, Pct.
        "blocks_per_set": 49,     # Rank, Team, S, Solos, Assists, Per Set
        "assists_per_set": 47,    # Rank, Team, S, Assists, Per Set
    },
}

# ── HTML Parsing ────────────────────────────────────────────────────────

def parse_stat_table(html: str) -> List[Dict[str, Any]]:
    """Parse an NCAA stats page table.
    Returns list of dicts: {slug, name, rank, cells}
    where cells is the list of raw cell text values.
    """
    soup = BeautifulSoup(html, "lxml")
    results = []

    table = soup.find("table")
    if not table:
        return results

    rows = table.find_all("tr")
    for row in rows[1:]:  # skip header
        cells = row.find_all(["td", "th"])
        if len(cells) < 3:
            continue

        link = row.find("a", href=re.compile(r"/schools/"))
        if not link:
            continue

        slug = link["href"].rstrip("/").split("/schools/")[-1]
        name = link.get_text(strip=True)
        cell_texts = [c.get_text(strip=True) for c in cells]

        results.append({
            "slug": slug,
            "name": name,
            "rank": int(cell_texts[0]) if cell_texts[0].isdigit() else 0,
            "cells": cell_texts,
        })

    return results


def parse_rankings_table(html: str) -> List[Dict[str, Any]]:
    """Parse NCAA rankings page. Rankings table has plain text, no links."""
    soup = BeautifulSoup(html, "lxml")
    results = []
    table = soup.find("table")
    if not table:
        return results

    rows = table.find_all("tr")
    current_region = ""

    for row in rows[1:]:
        cells = row.find_all(["td", "th"])
        cell_texts = [c.get_text(strip=True) for c in cells]

        # Skip empty rows
        if not any(t for t in cell_texts):
            continue

        # Region header row
        if any(t.startswith("Region") for t in cell_texts):
            for t in cell_texts:
                if t.startswith("Region"):
                    current_region = t
            continue

        # Data row: first non-empty cell is rank (number), second is school name, third is record
        rank = 0
        name = ""
        record = ""
        npi = 0.0

        for text in cell_texts:
            text = text.strip()
            if not text:
                continue
            if not rank and text.isdigit() and int(text) < 200:
                rank = int(text)
            elif not name and not text.isdigit() and not re.match(r"^\d+-\d+$", text) and not re.match(r"^\d+\.\d+$", text):
                name = text
            elif not record and re.match(r"^\d+-\d+$", text):
                record = text
            elif npi == 0.0 and re.match(r"^\d+\.\d+$", text):
                try:
                    npi = float(text)
                except ValueError:
                    pass

        if name and rank:
            # Generate slug from name
            slug = name.lower().replace(" ", "-").replace("(", "").replace(")", "").replace(".", "").replace("'", "")
            results.append({
                "slug": slug, "name": name, "rank": rank,
                "record": record, "npi": npi, "region": current_region,
            })

    return results


def _safe_float(val: str) -> float:
    """Convert string to float, return 0.0 on failure."""
    try:
        return float(val.replace(",", ""))
    except (ValueError, AttributeError):
        return 0.0


def _safe_int(val: str) -> int:
    """Convert string to int, return 0 on failure."""
    try:
        return int(val.replace(",", ""))
    except (ValueError, AttributeError):
        return 0


# ── Team Data Mapping ───────────────────────────────────────────────────

def map_stat_to_team(team_stats: dict, stat_name: str, cells: List[str]):
    """Map raw cell values to team stats dict based on stat type."""
    n = len(cells)
    # Basketball scoring
    if stat_name == "scoring_offense" and n >= 5:
        team_stats["games_played"] = _safe_int(cells[2])
        team_stats["total_points"] = _safe_int(cells[3])
        team_stats["ppg"] = _safe_float(cells[4])
    elif stat_name == "scoring_defense" and n >= 5:
        team_stats["opp_total_points"] = _safe_int(cells[3])
        team_stats["opp_ppg"] = _safe_float(cells[4])
    elif stat_name == "field_goal_pct" and n >= 6:
        team_stats["fgm"] = _safe_int(cells[3])
        team_stats["fga"] = _safe_int(cells[4])
        team_stats["fg_pct"] = _safe_float(cells[5])
    elif stat_name == "opp_field_goal_pct" and n >= 6:
        team_stats["opp_fgm"] = _safe_int(cells[3])
        team_stats["opp_fga"] = _safe_int(cells[4])
        team_stats["opp_fg_pct"] = _safe_float(cells[5])
    elif stat_name == "free_throw_pct" and n >= 6:
        team_stats["ftm"] = _safe_int(cells[3])
        team_stats["fta"] = _safe_int(cells[4])
        team_stats["ft_pct"] = _safe_float(cells[5])
    elif stat_name == "rebounds" and n >= 8:
        team_stats["reb"] = _safe_int(cells[3])
        team_stats["rpg"] = _safe_float(cells[4])
        team_stats["opp_reb"] = _safe_int(cells[5])
        team_stats["opp_rpg"] = _safe_float(cells[6])
        team_stats["reb_margin"] = _safe_float(cells[7])
    elif stat_name == "three_point_pct" and n >= 6:
        team_stats["three_fgm"] = _safe_int(cells[3])
        team_stats["three_fga"] = _safe_int(cells[4])
        team_stats["three_pct"] = _safe_float(cells[5])
    # Baseball/Softball
    elif stat_name == "batting_average" and n >= 6:
        team_stats["games_played"] = _safe_int(cells[2])
        team_stats["at_bats"] = _safe_int(cells[3])
        team_stats["hits"] = _safe_int(cells[4])
        team_stats["batting_avg"] = _safe_float(cells[5])
    elif stat_name == "earned_run_avg" and n >= 5:
        team_stats["innings_pitched"] = _safe_float(cells[3])
        team_stats["earned_runs"] = _safe_int(cells[4]) if n >= 5 else 0
        team_stats["era"] = _safe_float(cells[-1])
    # Soccer — column order differs between men/women but GAA is always last
    elif stat_name == "goals_against_avg" and n >= 6:
        team_stats["games_played"] = _safe_int(cells[2])
        team_stats["gaa"] = _safe_float(cells[-1])
    # Volleyball
    elif stat_name == "blocks_per_set" and n >= 6:
        team_stats["games_played"] = _safe_int(cells[2])
        team_stats["block_solos"] = _safe_int(cells[3])
        team_stats["block_assists"] = _safe_int(cells[4])
        team_stats["blocks_per_set"] = _safe_float(cells[5])
    elif stat_name == "assists_per_set" and n >= 4:
        team_stats["assists"] = _safe_int(cells[3]) if n >= 4 else 0
        team_stats["assists_per_set"] = _safe_float(cells[-1])
    # Winning Percentage (all sports) — handled specially, not mapped to stats
    # See _apply_winning_pct below


# ── Data Cache ──────────────────────────────────────────────────────────

class NCAACache:
    """In-memory store for scraped NCAA data."""

    def __init__(self):
        self.teams: Dict[str, Dict] = {}     # "slug_sport-slug" -> team dict
        self.rankings: Dict[str, List] = {}  # sport_slug -> ranking list
        self.last_updated: Optional[datetime.datetime] = None
        self.is_scraping: bool = False
        self.scrape_phase: Optional[str] = None
        self.progress_percent: int = 0
        self.current_run_label: Optional[str] = None
        self.scrape_log: List[str] = []
        self.error: Optional[str] = None
        self._next_id: int = 1

    def next_id(self) -> str:
        tid = str(self._next_id)
        self._next_id += 1
        return tid

    def get_teams_list(
        self,
        sport: Optional[str] = None,
        conference: Optional[str] = None,
        search: Optional[str] = None,
    ) -> List[Dict]:
        teams = list(self.teams.values())
        if sport:
            sl = sport.lower()
            teams = [t for t in teams if sl in t.get("sport", "").lower() or sl in t.get("sport_slug", "").lower()]
        if conference:
            cl = conference.lower()
            teams = [t for t in teams if cl in t.get("conference", "").lower()]
        if search:
            sl = search.lower()
            teams = [t for t in teams if sl in t.get("name", "").lower()]
        return sorted(teams, key=lambda t: t.get("name", ""))

    def get_team(self, team_id: str) -> Optional[Dict]:
        for t in self.teams.values():
            if t.get("id") == team_id:
                return t
        return None

    def reset(self):
        self.teams = {}
        self.rankings = {}
        self._next_id = 1
        self.error = None

    def set_next_id(self, next_id: int):
        self._next_id = next_id

    def load_snapshot(self, payload: Dict[str, Any]):
        self.teams = payload.get("teams", {})
        self.rankings = payload.get("rankings", {})
        self._next_id = int(payload.get("next_id", 1) or 1)
        self.error = payload.get("error")

        last_updated = payload.get("last_updated")
        if last_updated:
            try:
                self.last_updated = datetime.datetime.fromisoformat(last_updated)
            except ValueError:
                self.last_updated = None
        else:
            self.last_updated = None

    def to_snapshot(self) -> Dict[str, Any]:
        return {
            "teams": self.teams,
            "rankings": self.rankings,
            "next_id": self._next_id,
            "last_updated": self.last_updated.isoformat() if self.last_updated else None,
            "error": self.error,
        }


# Global cache
cache = NCAACache()


def load_cache_snapshot() -> bool:
    """Load the last successful scrape from disk, if available."""
    if not CACHE_SNAPSHOT_PATH.exists():
        return False

    try:
        payload = json.loads(CACHE_SNAPSHOT_PATH.read_text(encoding="utf-8"))
        cache.load_snapshot(payload)
        cache.scrape_log.append(f"Loaded cached NCAA snapshot from {CACHE_SNAPSHOT_PATH}")
        return True
    except (OSError, JSONDecodeError) as exc:
        logger.warning("Failed to load NCAA cache snapshot: %s", exc)
        return False


def save_cache_snapshot() -> bool:
    """Persist the latest successful scrape so restarts can serve warm data."""
    try:
        CACHE_SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
        temp_path = CACHE_SNAPSHOT_PATH.with_suffix(".tmp")
        temp_path.write_text(json.dumps(cache.to_snapshot()), encoding="utf-8")
        temp_path.replace(CACHE_SNAPSHOT_PATH)
        return True
    except OSError as exc:
        logger.warning("Failed to save NCAA cache snapshot: %s", exc)
        return False


# ── Scraping Functions ──────────────────────────────────────────────────

async def _fetch_page(client: httpx.AsyncClient, url: str) -> Optional[str]:
    """Fetch a page, return raw HTML or None."""
    try:
        resp = await client.get(url, headers=HEADERS, follow_redirects=True, timeout=30)
        if resp.status_code == 200:
            return resp.text
        logger.warning("HTTP %d for %s", resp.status_code, url)
    except httpx.HTTPError as e:
        logger.warning("Failed to fetch %s: %s", url, e)
    return None


async def _scrape_stat_pages(
    client: httpx.AsyncClient,
    sport_slug: str,
    stat_id: int,
    max_pages: int = 9,
) -> List[Dict]:
    """Scrape all pages of a stat category."""
    all_results: List[Dict] = []
    for page in range(1, max_pages + 1):
        url = f"{NCAA_BASE}/stats/{sport_slug}/d3/current/team/{stat_id}"
        if page > 1:
            url += f"/p{page}"
        html = await _fetch_page(client, url)
        if not html:
            break
        rows = parse_stat_table(html)
        if not rows:
            break
        all_results.extend(rows)
        await asyncio.sleep(0.35)
    return all_results


async def _scrape_rankings(client: httpx.AsyncClient, sport_slug: str) -> List[Dict]:
    """Scrape rankings page for a sport."""
    url = f"{NCAA_BASE}/rankings/{sport_slug}/d3"
    html = await _fetch_page(client, url)
    if not html:
        return []
    return parse_rankings_table(html)


def parse_school_info(html: str) -> Dict[str, str]:
    """Parse a /schools/{slug} page for conference, location, nickname."""
    soup = BeautifulSoup(html, "lxml")
    info: Dict[str, str] = {}

    # Location from "Division III - CITY, ST" text
    for tag in soup.find_all(string=re.compile(r"Division III\s*-", re.IGNORECASE)):
        text = " ".join(tag.split())
        match = re.search(r"Division III\s*-\s*(.+)", text, re.IGNORECASE)
        if match:
            info["location"] = match.group(1).strip()
            break

    # Conference, Nickname from <dl class="school-details"> <dt>/<dd> pairs
    for dt in soup.find_all("dt"):
        label = dt.get_text(strip=True).lower()
        dd = dt.find_next_sibling("dd")
        if dd:
            value = dd.get_text(strip=True)
            if label == "conference":
                info["conference"] = _normalize_scraped_conference_name(value)
            elif label == "nickname":
                info["nickname"] = value

    return info


def _normalize_scraped_conference_name(value: str) -> str:
    """Normalize incomplete conference strings returned by NCAA school pages."""
    normalized = " ".join(value.split()).strip()
    if not normalized:
        return normalized

    lower = normalized.lower()
    completed_suffixes = (
        "conference",
        "association",
        "league",
        "assn.",
        "assn",
    )
    if lower.endswith(completed_suffixes):
        return normalized
    if lower.startswith("of "):
        return f"Conference {normalized}"
    if lower.endswith(" athletic"):
        return f"{normalized} Conference"

    return normalized


def apply_conference_fallback_to_team(team: Dict[str, Any], slug_to_conference: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    """Fill missing conference for one team using slug-level inference and manual overrides."""
    if not team:
        return team

    current = str(team.get("conference") or "").strip()
    slug = str(team.get("slug") or "").strip().lower()

    # Manual overrides are authoritative for known bad or missing source values.
    manual_override = CONFERENCE_OVERRIDES_BY_SLUG.get(slug)
    if manual_override:
        team["conference"] = manual_override
        return team

    unknown_markers = {"", "n/a", "na", "unknown", "none", "null"}
    if current.lower() not in unknown_markers:
        return team

    inferred = None
    if slug_to_conference:
        inferred = slug_to_conference.get(slug)
    if not inferred:
        inferred = CONFERENCE_OVERRIDES_BY_SLUG.get(slug)
    if inferred:
        team["conference"] = inferred
    else:
        team["conference"] = "N/A"
    return team


def apply_conference_fallbacks_to_teams(teams: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Fill missing conferences across a team list without changing non-empty conference values."""
    if not teams:
        return teams

    slug_to_conference: Dict[str, str] = {}
    unknown_markers = {"", "n/a", "na", "unknown", "none", "null"}
    for team in teams:
        slug = str(team.get("slug") or "").strip().lower()
        conference = str(team.get("conference") or "").strip()
        if slug and conference and conference.lower() not in unknown_markers and slug not in slug_to_conference:
            slug_to_conference[slug] = conference

    for team in teams:
        apply_conference_fallback_to_team(team, slug_to_conference=slug_to_conference)

    return teams


async def _scrape_school_info(
    client: httpx.AsyncClient,
    slugs: List[str],
) -> Dict[str, Dict[str, str]]:
    """Scrape /schools/{slug} pages for conference, location, nickname."""
    results: Dict[str, Dict[str, str]] = {}
    progress = {"completed": 0}
    lock = asyncio.Lock()
    semaphore = asyncio.Semaphore(24)

    async def _fetch_school(slug: str):
        async with semaphore:
            url = f"{NCAA_BASE}/schools/{slug}"
            html = await _fetch_page(client, url)
            info = parse_school_info(html) if html else None

            async with lock:
                progress["completed"] += 1
                if info:
                    results[slug] = info
                if progress["completed"] % 100 == 0 or progress["completed"] == len(slugs):
                    cache.scrape_log.append(
                        f"    School info: {progress['completed']}/{len(slugs)}"
                    )

    await asyncio.gather(*(_fetch_school(slug) for slug in slugs))
    return results


# ── Main Scrape Orchestrator ────────────────────────────────────────────

async def scrape_all(sport_filter: Optional[List[str]] = None, run_label: Optional[str] = None):
    """Scrape NCAA D3 data. Call from background task."""
    if cache.is_scraping:
        return {
            "status": "already_running",
            "phase": cache.scrape_phase,
            "progress_percent": cache.progress_percent,
            "run_label": cache.current_run_label,
        }

    cache.is_scraping = True
    cache.scrape_phase = "Initializing scrape"
    cache.progress_percent = 0
    cache.current_run_label = run_label or ("sample" if sport_filter else "full")
    cache.scrape_log = [f"Started at {datetime.datetime.now().isoformat()}"]

    try:
        new_teams: Dict[str, Dict] = {}
        new_rankings: Dict[str, List] = {}
        next_id = [1]

        def get_id() -> str:
            tid = str(next_id[0])
            next_id[0] += 1
            return tid

        sports_to_scrape = list(SPORTS.items())
        if sport_filter:
            sports_to_scrape = [
                (n, s) for n, s in SPORTS.items()
                if s in sport_filter or n in sport_filter
            ]

        total_steps = sum(len(SPORT_STAT_IDS.get(sport_slug, {})) + 1 for _, sport_slug in sports_to_scrape) + 1
        completed_steps = 0

        def _set_progress(phase: str, completed: int, total: int):
            cache.scrape_phase = phase
            if total > 0:
                cache.progress_percent = min(99, int((completed / total) * 100))

        async with httpx.AsyncClient() as client:
            for sport_name, sport_slug in sports_to_scrape:
                cache.scrape_log.append(f"=== {sport_name} ===")
                _set_progress(f"Scraping {sport_name}", completed_steps, total_steps)

                # Get stat IDs for this sport
                stat_ids = SPORT_STAT_IDS.get(sport_slug, {})
                if not stat_ids:
                    cache.scrape_log.append("  No stat IDs configured, skipping")
                    continue
                max_pages = 9  # 50 rows/page × 9 = 450 max, covers all D3 teams

                # ── Scrape each stat category ──
                for stat_name, stat_id in stat_ids.items():
                    cache.scrape_log.append(f"  {stat_name}...")
                    _set_progress(f"{sport_name}: {stat_name}", completed_steps, total_steps)
                    rows = await _scrape_stat_pages(client, sport_slug, stat_id, max_pages)
                    cache.scrape_log.append(f"    {len(rows)} entries")

                    for entry in rows:
                        key = f"{entry['slug']}_{sport_slug}"

                        # Create team if new
                        if key not in new_teams:
                            new_teams[key] = {
                                "id": get_id(),
                                "name": entry["name"],
                                "slug": entry["slug"],
                                "sport": sport_name,
                                "sport_slug": sport_slug,
                                "conference": "",
                                "location": "",
                                "wins": 0,
                                "losses": 0,
                                "stats": {},
                            }

                        # winning_pct: extract W/L directly onto team, not stats
                        if stat_name == "winning_pct":
                            cells = entry["cells"]
                            n = len(cells)
                            # Basketball/Volleyball: Rank, Team, W, L, PCT
                            # Baseball/Softball/Soccer: Rank, Team, W, L, T, PCT
                            if n >= 5:
                                new_teams[key]["wins"] = _safe_int(cells[2])
                                new_teams[key]["losses"] = _safe_int(cells[3])
                        else:
                            # Map stat values
                            map_stat_to_team(new_teams[key]["stats"], stat_name, entry["cells"])

                    # Small delay between stat categories
                    await asyncio.sleep(0.5)
                    completed_steps += 1

                # ── Scrape rankings ──
                cache.scrape_log.append("  Rankings...")
                _set_progress(f"{sport_name}: rankings", completed_steps, total_steps)
                sport_rankings = await _scrape_rankings(client, sport_slug)
                new_rankings[sport_slug] = sport_rankings
                cache.scrape_log.append(f"    {len(sport_rankings)} ranked teams")

                # Merge ranking data into teams.
                # Use strict matching to avoid assigning ranking records to the wrong school.
                sport_teams = [
                    (key, team_data)
                    for key, team_data in new_teams.items()
                    if key.endswith(f"_{sport_slug}")
                ]

                def _normalize_school_name(value: str) -> str:
                    return re.sub(r"[^a-z0-9]", "", (value or "").lower())

                for r in sport_rankings:
                    # Prefer exact slug match first, then exact normalized name.
                    r_slug = (r.get("slug") or "").lower()
                    r_name_normalized = _normalize_school_name(r.get("name", ""))
                    matched_key = None
                    for key, t in sport_teams:
                        t_slug = (t.get("slug") or "").lower()
                        if r_slug and t_slug == r_slug:
                            matched_key = key
                            break

                    if not matched_key and r_name_normalized:
                        for key, t in sport_teams:
                            t_name_normalized = _normalize_school_name(t.get("name", ""))
                            if t_name_normalized == r_name_normalized:
                                matched_key = key
                                break

                    if matched_key and r["record"]:
                        parts = [p.strip() for p in r["record"].split("-") if p.strip().isdigit()]
                        # Keep wins/losses from the winning_pct leaderboard as authoritative.
                        # Rankings records can lag behind and are used only as a fallback.
                        current_wins = new_teams[matched_key].get("wins", 0)
                        current_losses = new_teams[matched_key].get("losses", 0)
                        if current_wins == 0 and current_losses == 0 and len(parts) >= 2:
                            try:
                                new_teams[matched_key]["wins"] = int(parts[0])
                                new_teams[matched_key]["losses"] = int(parts[1])
                            except ValueError:
                                pass
                        new_teams[matched_key]["ranking"] = r["rank"]
                        new_teams[matched_key]["npi"] = r["npi"]
                        new_teams[matched_key]["region"] = r["region"]

                # Delay between sports
                await asyncio.sleep(1.0)
                completed_steps += 1

            # ── Scrape school info (conference, location) ──
            unique_slugs = list(set(t["slug"] for t in new_teams.values()))
            cache.scrape_log.append(f"=== School Info ({len(unique_slugs)} schools) ===")
            _set_progress("Loading school profiles", completed_steps, total_steps)
            school_info = await _scrape_school_info(client, unique_slugs)
            cache.scrape_log.append(f"  Got info for {len(school_info)} schools")

            # Apply school info to teams
            for key, team in new_teams.items():
                slug = team["slug"]
                if slug in school_info:
                    info = school_info[slug]
                    if "location" in info:
                        team["location"] = info["location"]
                    if "conference" in info:
                        team["conference"] = info["conference"]
                    if "nickname" in info:
                        team["nickname"] = info["nickname"]

            # Backfill missing conferences from known slug-level values and manual overrides.
            apply_conference_fallbacks_to_teams(list(new_teams.values()))

            completed_steps += 1

        # Atomic cache update
        cache.teams = new_teams
        cache.rankings = new_rankings
        cache.last_updated = datetime.datetime.now()
        cache.error = None
        cache.set_next_id(next_id[0])
        persist_scrape_result(new_teams, new_rankings, cache.last_updated)
        save_cache_snapshot()

        msg = f"Complete: {len(new_teams)} teams, {len(sports_to_scrape)} sports"
        cache.scrape_log.append(msg)
        logger.info(msg)
        cache.scrape_phase = "Complete"
        cache.progress_percent = 100

        return {
            "status": "complete",
            "teams": len(new_teams),
            "sports": len(sports_to_scrape),
            "last_updated": cache.last_updated.isoformat(),
            "phase": cache.scrape_phase,
            "progress_percent": cache.progress_percent,
            "run_label": cache.current_run_label,
        }

    except (httpx.HTTPError, OSError, ValueError, TypeError) as e:
        cache.error = str(e)
        cache.scrape_log.append(f"ERROR: {e}")
        logger.error("Scrape failed: %s", e, exc_info=True)
        cache.scrape_phase = f"Error: {str(e)}"
        return {"status": "error", "error": str(e)}

    finally:
        cache.is_scraping = False


def get_scrape_status() -> Dict[str, Any]:
    """Return current scrape status."""
    return {
        "is_scraping": cache.is_scraping,
        "phase": cache.scrape_phase,
        "progress_percent": cache.progress_percent,
        "run_label": cache.current_run_label,
        "last_updated": cache.last_updated.isoformat() if cache.last_updated else None,
        "total_teams": len(cache.teams),
        "total_sports": len(set(t["sport"] for t in cache.teams.values())) if cache.teams else 0,
        "error": cache.error,
        "log": cache.scrape_log[-30:],
    }
