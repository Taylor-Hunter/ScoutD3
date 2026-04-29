import datetime
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
import json

from dotenv import load_dotenv
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, create_engine, func, or_, select, text, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, joinedload, mapped_column, relationship, sessionmaker

load_dotenv(Path(__file__).resolve().parent / ".env")


def _normalize_database_url(raw_url: str) -> str:
    if raw_url.startswith("postgresql+asyncpg://"):
        return raw_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://", 1)
    if raw_url.startswith("postgres://"):
        return raw_url.replace("postgres://", "postgresql+psycopg2://", 1)
    if raw_url.startswith("postgresql://"):
        return raw_url.replace("postgresql://", "postgresql+psycopg2://", 1)
    if raw_url.startswith("sqlite+aiosqlite:///"):
        return raw_url.replace("sqlite+aiosqlite:///", "sqlite:///", 1)
    return raw_url


DATABASE_URL = _normalize_database_url(os.getenv("DATABASE_URL", "sqlite:///./scoutd3.db"))
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "scoutd3-dev-secret-change-me")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def _engine_kwargs() -> Dict[str, Any]:
    if DATABASE_URL.startswith("sqlite"):
        return {"future": True}
    return {
        "future": True,
        "pool_pre_ping": True,
        "pool_size": int(os.getenv("DATABASE_POOL_SIZE", "5")),
        "max_overflow": int(os.getenv("DATABASE_MAX_OVERFLOW", "10")),
    }


engine = create_engine(DATABASE_URL, **_engine_kwargs())
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False, future=True)


class Base(DeclarativeBase):
    pass


class DataSyncRun(Base):
    __tablename__ = "data_sync_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source: Mapped[str] = mapped_column(String(64), default="ncaa.com")
    status: Mapped[str] = mapped_column(String(32), default="completed")
    started_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)
    completed_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime, nullable=True)
    total_teams: Mapped[int] = mapped_column(Integer, default=0)
    total_sports: Mapped[int] = mapped_column(Integer, default=0)
    total_rankings: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    teams: Mapped[List["Team"]] = relationship(back_populates="sync_run", cascade="all, delete-orphan")
    rankings: Mapped[List["TeamRanking"]] = relationship(back_populates="sync_run", cascade="all, delete-orphan")


class Team(Base):
    __tablename__ = "teams"
    __table_args__ = (UniqueConstraint("sync_run_id", "team_uid", name="uq_team_sync_uid"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sync_run_id: Mapped[int] = mapped_column(ForeignKey("data_sync_runs.id"), index=True)
    team_uid: Mapped[str] = mapped_column(String(255), index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    slug: Mapped[str] = mapped_column(String(255), index=True)
    sport: Mapped[str] = mapped_column(String(255), index=True)
    sport_slug: Mapped[str] = mapped_column(String(255), index=True)
    conference: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    wins: Mapped[int] = mapped_column(Integer, default=0)
    losses: Mapped[int] = mapped_column(Integer, default=0)
    nickname: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    ranking: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    npi: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    region: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    sync_run: Mapped[DataSyncRun] = relationship(back_populates="teams")
    stats: Mapped[Optional["TeamStats"]] = relationship(back_populates="team", cascade="all, delete-orphan", uselist=False)


class TeamStats(Base):
    __tablename__ = "team_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), unique=True, index=True)

    games_played: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_points: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ppg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    opp_total_points: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    opp_ppg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    fgm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    fga: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    fg_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    opp_fgm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    opp_fga: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    opp_fg_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ftm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    fta: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ft_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    reb: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rpg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    opp_reb: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    opp_rpg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    reb_margin: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    three_fgm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    three_fga: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    three_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    at_bats: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    hits: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    batting_avg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    innings_pitched: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    earned_runs: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    era: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    gaa: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    block_solos: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    block_assists: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    blocks_per_set: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    assists: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    assists_per_set: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    team: Mapped[Team] = relationship(back_populates="stats")


class TeamRanking(Base):
    __tablename__ = "team_rankings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sync_run_id: Mapped[int] = mapped_column(ForeignKey("data_sync_runs.id"), index=True)
    sport_slug: Mapped[str] = mapped_column(String(255), index=True)
    rank: Mapped[int] = mapped_column(Integer)
    team_name: Mapped[str] = mapped_column(String(255))
    team_slug: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    record: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    npi: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    region: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    sync_run: Mapped[DataSyncRun] = relationship(back_populates="rankings")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)
    last_login_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    activities: Mapped[List["UserActivityEvent"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class UserActivityEvent(Base):
    __tablename__ = "user_activity_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    route: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    team_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    comparison_team_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    metadata_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow, index=True)

    user: Mapped[User] = relationship(back_populates="activities")


STAT_FIELDS = [
    "games_played", "total_points", "ppg", "opp_total_points", "opp_ppg",
    "fgm", "fga", "fg_pct", "opp_fgm", "opp_fga", "opp_fg_pct",
    "ftm", "fta", "ft_pct", "reb", "rpg", "opp_reb", "opp_rpg",
    "reb_margin", "three_fgm", "three_fga", "three_pct", "at_bats",
    "hits", "batting_avg", "innings_pitched", "earned_runs", "era", "gaa",
    "block_solos", "block_assists", "blocks_per_set", "assists", "assists_per_set",
]


def init_database() -> None:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))


def _user_to_dict(user: User) -> Dict[str, Any]:
    return {
        "id": user.id,
        "username": user.username,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "is_active": user.is_active,
    }


def _serialize_metadata(metadata: Optional[Dict[str, Any]]) -> Optional[str]:
    if not metadata:
        return None
    return json.dumps(metadata)


def _deserialize_metadata(raw: Optional[str]) -> Dict[str, Any]:
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return {}


def _activity_to_dict(activity: UserActivityEvent) -> Dict[str, Any]:
    return {
        "id": activity.id,
        "event_type": activity.event_type,
        "route": activity.route,
        "team_id": activity.team_id,
        "comparison_team_id": activity.comparison_team_id,
        "metadata": _deserialize_metadata(activity.metadata_json),
        "created_at": activity.created_at.isoformat() if activity.created_at else None,
    }


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_access_token(user: User) -> str:
    now = datetime.datetime.utcnow()
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "exp": now + datetime.timedelta(minutes=JWT_EXPIRE_MINUTES),
        "iat": now,
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    try:
        with SessionLocal() as session:
            user = session.get(User, user_id)
            if not user or not user.is_active:
                return None
            return _user_to_dict(user)
    except SQLAlchemyError:
        return None


def get_user_by_username(username: str) -> Optional[Dict[str, Any]]:
    try:
        with SessionLocal() as session:
            stmt = select(User).where(func.lower(User.username) == username.lower()).limit(1)
            user = session.execute(stmt).scalar_one_or_none()
            if not user or not user.is_active:
                return None
            return _user_to_dict(user)
    except SQLAlchemyError:
        return None


def create_user(username: str, password: str) -> Dict[str, Any]:
    normalized = username.strip()
    if not normalized:
        raise ValueError("Username is required")
    if len(normalized) < 3:
        raise ValueError("Username must be at least 3 characters")
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters")

    try:
        with SessionLocal() as session:
            with session.begin():
                existing = session.execute(
                    select(User).where(func.lower(User.username) == normalized.lower()).limit(1)
                ).scalar_one_or_none()
                if existing:
                    raise ValueError("Username is already taken")

                user = User(
                    username=normalized,
                    password_hash=hash_password(password),
                    created_at=datetime.datetime.utcnow(),
                    is_active=True,
                )
                session.add(user)
                session.flush()
                return _user_to_dict(user)
    except SQLAlchemyError as exc:
        raise ValueError("Unable to create user") from exc


def authenticate_user(username: str, password: str) -> Optional[Dict[str, Any]]:
    try:
        with SessionLocal() as session:
            with session.begin():
                user = session.execute(
                    select(User).where(func.lower(User.username) == username.lower()).limit(1)
                ).scalar_one_or_none()
                if not user or not user.is_active:
                    return None
                if not verify_password(password, user.password_hash):
                    return None

                user.last_login_at = datetime.datetime.utcnow()
                session.flush()

                token = create_access_token(user)
                return {
                    "access_token": token,
                    "token_type": "bearer",
                    "user": _user_to_dict(user),
                }
    except SQLAlchemyError:
        return None


def get_user_from_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        subject = payload.get("sub")
        if not subject:
            return None
        return get_user_by_id(int(subject))
    except (JWTError, ValueError):
        return None


def log_user_activity(
    user_id: int,
    event_type: str,
    route: Optional[str] = None,
    team_id: Optional[str] = None,
    comparison_team_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    try:
        with SessionLocal() as session:
            with session.begin():
                activity = UserActivityEvent(
                    user_id=user_id,
                    event_type=event_type,
                    route=route,
                    team_id=str(team_id) if team_id else None,
                    comparison_team_id=str(comparison_team_id) if comparison_team_id else None,
                    metadata_json=_serialize_metadata(metadata),
                    created_at=datetime.datetime.utcnow(),
                )
                session.add(activity)
                session.flush()
                return _activity_to_dict(activity)
    except SQLAlchemyError:
        return None


def get_recent_user_activity(user_id: int, limit: int = 50) -> List[Dict[str, Any]]:
    try:
        with SessionLocal() as session:
            stmt = (
                select(UserActivityEvent)
                .where(UserActivityEvent.user_id == user_id)
                .order_by(UserActivityEvent.created_at.desc())
                .limit(limit)
            )
            activities = session.execute(stmt).scalars().all()
            return [_activity_to_dict(activity) for activity in activities]
    except SQLAlchemyError:
        return []


def _active_sync_run(session: Session) -> Optional[DataSyncRun]:
    stmt = select(DataSyncRun).where(DataSyncRun.is_active.is_(True)).order_by(DataSyncRun.id.desc()).limit(1)
    return session.execute(stmt).scalar_one_or_none()


def get_active_dataset_summary() -> Dict[str, Any]:
    try:
        with SessionLocal() as session:
            sync_run = _active_sync_run(session)
            if not sync_run:
                return {
                    "total_teams": 0,
                    "total_sports": 0,
                    "total_rankings": 0,
                    "college_count": 0,
                    "last_updated": None,
                }

            college_count = len(
                session.execute(
                    select(Team.slug).where(Team.sync_run_id == sync_run.id).distinct()
                ).scalars().all()
            )

            return {
                "total_teams": sync_run.total_teams or 0,
                "total_sports": sync_run.total_sports or 0,
                "total_rankings": sync_run.total_rankings or 0,
                "college_count": int(college_count or 0),
                "last_updated": sync_run.completed_at,
            }
    except SQLAlchemyError:
        return {
            "total_teams": 0,
            "total_sports": 0,
            "total_rankings": 0,
            "college_count": 0,
            "last_updated": None,
        }


def _team_to_dict(team: Team) -> Dict[str, Any]:
    stats_payload: Dict[str, Any] = {}
    if team.stats:
        for field in STAT_FIELDS:
            value = getattr(team.stats, field)
            if value is not None:
                stats_payload[field] = value

    payload: Dict[str, Any] = {
        "id": team.team_uid,
        "name": team.name,
        "slug": team.slug,
        "sport": team.sport,
        "sport_slug": team.sport_slug,
        "conference": (team.conference or "").strip() or "N/A",
        "location": team.location or "",
        "wins": team.wins or 0,
        "losses": team.losses or 0,
        "stats": stats_payload,
    }
    if team.nickname:
        payload["nickname"] = team.nickname
    if team.ranking is not None:
        payload["ranking"] = team.ranking
    if team.npi is not None:
        payload["npi"] = team.npi
    if team.region:
        payload["region"] = team.region
    return payload


def get_team(team_id: str) -> Optional[Dict[str, Any]]:
    try:
        with SessionLocal() as session:
            sync_run = _active_sync_run(session)
            if not sync_run:
                return None

            stmt = (
                select(Team)
                .options(joinedload(Team.stats))
                .where(Team.sync_run_id == sync_run.id, Team.team_uid == str(team_id))
                .limit(1)
            )
            team = session.execute(stmt).scalar_one_or_none()
            return _team_to_dict(team) if team else None
    except SQLAlchemyError:
        return None


def get_teams_list(
    sport: Optional[str] = None,
    conference: Optional[str] = None,
    search: Optional[str] = None,
) -> List[Dict[str, Any]]:
    try:
        with SessionLocal() as session:
            sync_run = _active_sync_run(session)
            if not sync_run:
                return []

            stmt = select(Team).options(joinedload(Team.stats)).where(Team.sync_run_id == sync_run.id)
            if sport:
                pattern = f"%{sport.lower()}%"
                stmt = stmt.where(
                    or_(
                        func.lower(Team.sport).like(pattern),
                        func.lower(Team.sport_slug).like(pattern),
                    )
                )
            if conference:
                stmt = stmt.where(func.lower(Team.conference).like(f"%{conference.lower()}%"))
            if search:
                pattern = f"%{search.lower()}%"
                stmt = stmt.where(
                    or_(
                        func.lower(Team.name).like(pattern),
                        func.lower(Team.slug).like(pattern),
                    )
                )

            teams = session.execute(stmt.order_by(Team.name.asc())).scalars().all()
            return [_team_to_dict(team) for team in teams]
    except SQLAlchemyError:
        return []


def get_rankings(sport_slug: str) -> List[Dict[str, Any]]:
    try:
        with SessionLocal() as session:
            sync_run = _active_sync_run(session)
            if not sync_run:
                return []

            stmt = (
                select(TeamRanking)
                .where(TeamRanking.sync_run_id == sync_run.id, TeamRanking.sport_slug == sport_slug)
                .order_by(TeamRanking.rank.asc())
            )
            rankings = session.execute(stmt).scalars().all()
            return [
                {
                    "rank": row.rank,
                    "name": row.team_name,
                    "slug": row.team_slug,
                    "record": row.record,
                    "npi": row.npi,
                    "region": row.region,
                }
                for row in rankings
            ]
    except SQLAlchemyError:
        return []


def persist_scrape_result(
    teams: Dict[str, Dict[str, Any]],
    rankings: Dict[str, List[Dict[str, Any]]],
    completed_at: Optional[datetime.datetime] = None,
) -> Dict[str, Any]:
    completed_at = completed_at or datetime.datetime.utcnow()
    total_sports = len({team.get("sport") for team in teams.values() if team.get("sport")})
    total_rankings = sum(len(entries) for entries in rankings.values())

    with SessionLocal() as session:
        with session.begin():
            sync_run = DataSyncRun(
                source="ncaa.com",
                status="completed",
                started_at=completed_at,
                completed_at=completed_at,
                total_teams=len(teams),
                total_sports=total_sports,
                total_rankings=total_rankings,
                is_active=False,
            )
            session.add(sync_run)
            session.flush()

            for team in teams.values():
                team_row = Team(
                    sync_run_id=sync_run.id,
                    team_uid=str(team.get("id", "")),
                    name=team.get("name", ""),
                    slug=team.get("slug", ""),
                    sport=team.get("sport", ""),
                    sport_slug=team.get("sport_slug", ""),
                    conference=team.get("conference") or "",
                    location=team.get("location") or "",
                    wins=int(team.get("wins", 0) or 0),
                    losses=int(team.get("losses", 0) or 0),
                    nickname=team.get("nickname"),
                    ranking=team.get("ranking"),
                    npi=team.get("npi"),
                    region=team.get("region"),
                )
                session.add(team_row)
                session.flush()

                stat_values = {field: team.get("stats", {}).get(field) for field in STAT_FIELDS}
                if any(value is not None for value in stat_values.values()):
                    session.add(TeamStats(team_id=team_row.id, **stat_values))

            for sport_slug, entries in rankings.items():
                for entry in entries:
                    session.add(
                        TeamRanking(
                            sync_run_id=sync_run.id,
                            sport_slug=sport_slug,
                            rank=int(entry.get("rank", 0) or 0),
                            team_name=entry.get("name", ""),
                            team_slug=entry.get("slug"),
                            record=entry.get("record"),
                            npi=entry.get("npi"),
                            region=entry.get("region"),
                        )
                    )

            session.execute(update(DataSyncRun).where(DataSyncRun.is_active.is_(True)).values(is_active=False))
            sync_run.is_active = True

    return {
        "sync_run_id": sync_run.id,
        "total_teams": len(teams),
        "total_sports": total_sports,
        "total_rankings": total_rankings,
    }