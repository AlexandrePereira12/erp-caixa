from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, Identity, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class AuditoriaLog(Base):
    """Append-only: o role da aplicação não tem UPDATE/DELETE e um trigger bloqueia todos."""

    __tablename__ = "auditoria_log"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    ocorrido_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    usuario_id: Mapped[int | None] = mapped_column(BigInteger)
    usuario_nome: Mapped[str | None] = mapped_column(String(120))
    papel: Mapped[str | None] = mapped_column(String(200))
    ip: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(300))
    request_id: Mapped[str | None] = mapped_column(String(64))
    acao: Mapped[str] = mapped_column(String(40))
    modulo: Mapped[str] = mapped_column(String(40))
    recurso: Mapped[str] = mapped_column(String(60))
    recurso_id: Mapped[str | None] = mapped_column(String(60))
    descricao: Mapped[str] = mapped_column(Text)
    antes: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    depois: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    campos_alterados: Mapped[list[str] | None] = mapped_column(JSONB)

    __table_args__ = (
        Index("ix_auditoria_log_ocorrido_em", "ocorrido_em"),
        Index("ix_auditoria_log_usuario_id", "usuario_id"),
        Index("ix_auditoria_log_recurso", "modulo", "recurso", "recurso_id"),
        Index("ix_auditoria_log_request_id", "request_id"),
        Index("ix_auditoria_log_acao", "acao"),
    )
