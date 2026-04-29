# pyright: reportMissingImports=false, reportMissingModuleSource=false, reportAttributeAccessIssue=false
"""initial relational store

Revision ID: 20260419_0001
Revises:
Create Date: 2026-04-19 00:00:00
"""

import sqlalchemy as sa
import importlib

alembic_op = importlib.import_module("alembic.op")


create_table = getattr(alembic_op, "create_table")
create_index = getattr(alembic_op, "create_index")
drop_index = getattr(alembic_op, "drop_index")
drop_table = getattr(alembic_op, "drop_table")


revision = "20260419_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    create_table(
        "data_sync_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("total_teams", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_sports", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_rankings", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("error", sa.Text(), nullable=True),
    )
    create_index("ix_data_sync_runs_is_active", "data_sync_runs", ["is_active"])

    create_table(
        "teams",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sync_run_id", sa.Integer(), sa.ForeignKey("data_sync_runs.id"), nullable=False),
        sa.Column("team_uid", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=255), nullable=False),
        sa.Column("sport", sa.String(length=255), nullable=False),
        sa.Column("sport_slug", sa.String(length=255), nullable=False),
        sa.Column("conference", sa.String(length=255), nullable=True),
        sa.Column("location", sa.String(length=255), nullable=True),
        sa.Column("wins", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("losses", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("nickname", sa.String(length=255), nullable=True),
        sa.Column("ranking", sa.Integer(), nullable=True),
        sa.Column("npi", sa.Float(), nullable=True),
        sa.Column("region", sa.String(length=255), nullable=True),
        sa.UniqueConstraint("sync_run_id", "team_uid", name="uq_team_sync_uid"),
    )
    create_index("ix_teams_sync_run_id", "teams", ["sync_run_id"])
    create_index("ix_teams_team_uid", "teams", ["team_uid"])
    create_index("ix_teams_name", "teams", ["name"])
    create_index("ix_teams_slug", "teams", ["slug"])
    create_index("ix_teams_sport", "teams", ["sport"])
    create_index("ix_teams_sport_slug", "teams", ["sport_slug"])

    create_table(
        "team_stats",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("teams.id"), nullable=False),
        sa.Column("games_played", sa.Integer(), nullable=True),
        sa.Column("total_points", sa.Integer(), nullable=True),
        sa.Column("ppg", sa.Float(), nullable=True),
        sa.Column("opp_total_points", sa.Integer(), nullable=True),
        sa.Column("opp_ppg", sa.Float(), nullable=True),
        sa.Column("fgm", sa.Integer(), nullable=True),
        sa.Column("fga", sa.Integer(), nullable=True),
        sa.Column("fg_pct", sa.Float(), nullable=True),
        sa.Column("opp_fgm", sa.Integer(), nullable=True),
        sa.Column("opp_fga", sa.Integer(), nullable=True),
        sa.Column("opp_fg_pct", sa.Float(), nullable=True),
        sa.Column("ftm", sa.Integer(), nullable=True),
        sa.Column("fta", sa.Integer(), nullable=True),
        sa.Column("ft_pct", sa.Float(), nullable=True),
        sa.Column("reb", sa.Integer(), nullable=True),
        sa.Column("rpg", sa.Float(), nullable=True),
        sa.Column("opp_reb", sa.Integer(), nullable=True),
        sa.Column("opp_rpg", sa.Float(), nullable=True),
        sa.Column("reb_margin", sa.Float(), nullable=True),
        sa.Column("three_fgm", sa.Integer(), nullable=True),
        sa.Column("three_fga", sa.Integer(), nullable=True),
        sa.Column("three_pct", sa.Float(), nullable=True),
        sa.Column("at_bats", sa.Integer(), nullable=True),
        sa.Column("hits", sa.Integer(), nullable=True),
        sa.Column("batting_avg", sa.Float(), nullable=True),
        sa.Column("innings_pitched", sa.Float(), nullable=True),
        sa.Column("earned_runs", sa.Integer(), nullable=True),
        sa.Column("era", sa.Float(), nullable=True),
        sa.Column("gaa", sa.Float(), nullable=True),
        sa.Column("block_solos", sa.Integer(), nullable=True),
        sa.Column("block_assists", sa.Integer(), nullable=True),
        sa.Column("blocks_per_set", sa.Float(), nullable=True),
        sa.Column("assists", sa.Integer(), nullable=True),
        sa.Column("assists_per_set", sa.Float(), nullable=True),
        sa.UniqueConstraint("team_id"),
    )
    create_index("ix_team_stats_team_id", "team_stats", ["team_id"])

    create_table(
        "team_rankings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sync_run_id", sa.Integer(), sa.ForeignKey("data_sync_runs.id"), nullable=False),
        sa.Column("sport_slug", sa.String(length=255), nullable=False),
        sa.Column("rank", sa.Integer(), nullable=False),
        sa.Column("team_name", sa.String(length=255), nullable=False),
        sa.Column("team_slug", sa.String(length=255), nullable=True),
        sa.Column("record", sa.String(length=64), nullable=True),
        sa.Column("npi", sa.Float(), nullable=True),
        sa.Column("region", sa.String(length=255), nullable=True),
    )
    create_index("ix_team_rankings_sync_run_id", "team_rankings", ["sync_run_id"])
    create_index("ix_team_rankings_sport_slug", "team_rankings", ["sport_slug"])


def downgrade() -> None:
    drop_index("ix_team_rankings_sport_slug", table_name="team_rankings")
    drop_index("ix_team_rankings_sync_run_id", table_name="team_rankings")
    drop_table("team_rankings")
    drop_index("ix_team_stats_team_id", table_name="team_stats")
    drop_table("team_stats")
    drop_index("ix_teams_sport_slug", table_name="teams")
    drop_index("ix_teams_sport", table_name="teams")
    drop_index("ix_teams_slug", table_name="teams")
    drop_index("ix_teams_name", table_name="teams")
    drop_index("ix_teams_team_uid", table_name="teams")
    drop_index("ix_teams_sync_run_id", table_name="teams")
    drop_table("teams")
    drop_index("ix_data_sync_runs_is_active", table_name="data_sync_runs")
    drop_table("data_sync_runs")