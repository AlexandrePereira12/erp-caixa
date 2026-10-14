from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine

import app.models  # noqa: F401
from app.core.db import Base
from conftest import OWNER, _url


def test_modelos_batem_com_as_migrations(ambiente):
    engine = create_engine(_url(ambiente.db_nome, OWNER))
    with engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn), Base.metadata)
    engine.dispose()
    assert diff == []
