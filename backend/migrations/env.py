"""Migrations rodam com o role OWNER (DATABASE_OWNER_URL); a API usa só o role app."""

import os

from alembic import context
from sqlalchemy import create_engine, pool

import app.models  # noqa: F401  (registra os modelos no metadata)
from app.core.db import Base

config = context.config
target_metadata = Base.metadata


def _url() -> str:
    url = os.environ.get("DATABASE_OWNER_URL")
    if not url:
        raise SystemExit("DATABASE_OWNER_URL não definida: migrations exigem o role owner.")
    return url


def run_migrations_offline() -> None:
    context.configure(url=_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
