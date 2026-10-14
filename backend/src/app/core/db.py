from collections.abc import Iterator
from datetime import UTC, datetime
from functools import lru_cache

from sqlalchemy import BigInteger, DateTime, ForeignKey, MetaData, create_engine, event, func
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from app.core.config import get_settings
from app.core.context import get_context

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class Autoria:
    """Colunas padrão de toda tabela de negócio (created_*, updated_*, deleted_*).

    created_by/updated_by são preenchidos pelo listener `before_flush` abaixo, a partir do
    contexto da requisição, para nenhum serviço esquecer de preencher.
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("usuario.id"), nullable=True
    )
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("usuario.id"), nullable=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("usuario.id"), nullable=True
    )


@event.listens_for(Session, "before_flush")
def _preencher_autoria(session: Session, flush_context: object, instances: object) -> None:
    usuario_id = get_context().usuario_id
    agora = datetime.now(UTC)
    for obj in session.new:
        # Qualquer modelo com created_by (inclusive tabelas append-only, que não têm updated_*).
        if hasattr(obj, "created_by") and obj.created_by is None:
            obj.created_by = usuario_id
    for obj in session.dirty:
        if isinstance(obj, Autoria) and session.is_modified(obj, include_collections=False):
            obj.updated_at = agora
            if usuario_id is not None:
                obj.updated_by = usuario_id


@lru_cache
def get_engine() -> Engine:
    s = get_settings()
    opcoes = (
        "-c timezone=UTC "
        f"-c lock_timeout={s.db_lock_timeout_ms} "
        f"-c statement_timeout={s.db_statement_timeout_ms} "
        f"-c idle_in_transaction_session_timeout={s.db_idle_in_transaction_timeout_ms}"
    )
    return create_engine(
        s.database_url,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=10,
        connect_args={"options": opcoes, "application_name": f"{s.empresa_slug}_api"},
    )


@lru_cache
def get_sessionmaker() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """Uma sessão por requisição. Quem muda dados chama `commit()` no fim do caso de uso;
    sem commit explícito, tudo é desfeito ao fechar."""
    with get_sessionmaker()() as session:
        yield session
