# pyright: reportMissingImports=false, reportMissingModuleSource=false, reportAttributeAccessIssue=false
"""auth and activity tables

Revision ID: 20260419_0002
Revises: 20260419_0001
Create Date: 2026-04-19 00:30:00
"""

import sqlalchemy as sa
import importlib

alembic_op = importlib.import_module("alembic.op")


create_table = getattr(alembic_op, "create_table")
create_index = getattr(alembic_op, "create_index")
drop_index = getattr(alembic_op, "drop_index")
drop_table = getattr(alembic_op, "drop_table")


revision = "20260419_0002"
down_revision = "20260419_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    create_index("ix_users_username", "users", ["username"], unique=True)

    create_table(
        "user_activity_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("route", sa.String(length=255), nullable=True),
        sa.Column("team_id", sa.String(length=255), nullable=True),
        sa.Column("comparison_team_id", sa.String(length=255), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    create_index("ix_user_activity_events_user_id", "user_activity_events", ["user_id"])
    create_index("ix_user_activity_events_event_type", "user_activity_events", ["event_type"])
    create_index("ix_user_activity_events_created_at", "user_activity_events", ["created_at"])


def downgrade() -> None:
    drop_index("ix_user_activity_events_created_at", table_name="user_activity_events")
    drop_index("ix_user_activity_events_event_type", table_name="user_activity_events")
    drop_index("ix_user_activity_events_user_id", table_name="user_activity_events")
    drop_table("user_activity_events")
    drop_index("ix_users_username", table_name="users")
    drop_table("users")