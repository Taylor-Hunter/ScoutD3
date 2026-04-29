# pyright: reportMissingImports=false, reportMissingModuleSource=false, reportAttributeAccessIssue=false
# pylint: disable=import-error,no-name-in-module
from __future__ import annotations

from importlib import import_module
from logging.config import fileConfig
import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool

alembic_context = import_module("alembic.context")

from postgres_store import Base, _normalize_database_url

config = getattr(alembic_context, "config")
configure_migrations = getattr(alembic_context, "configure")
begin_transaction = getattr(alembic_context, "begin_transaction")
run_migrations = getattr(alembic_context, "run_migrations")
is_offline_mode = getattr(alembic_context, "is_offline_mode")

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

database_url = _normalize_database_url(os.getenv("DATABASE_URL", config.get_main_option("sqlalchemy.url")))
config.set_main_option("sqlalchemy.url", database_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    configure_migrations(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
        dialect_opts={"paramstyle": "named"},
    )

    with begin_transaction():
        run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        configure_migrations(connection=connection, target_metadata=target_metadata, compare_type=True)

        with begin_transaction():
            run_migrations()


if is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()