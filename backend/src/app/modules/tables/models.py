from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Identity,
    Index,
    SmallInteger,
    String,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Autoria, Base

STATUS_MESA = ("livre", "ocupada", "aguardando_pagamento", "reservada", "bloqueada")


class Mesa(Autoria, Base):
    __tablename__ = "mesa"
    __table_args__ = (
        CheckConstraint(
            "status IN ('livre', 'ocupada', 'aguardando_pagamento', 'reservada', 'bloqueada')",
            name="status",
        ),
        Index(
            "uq_mesa_nome_ativa",
            text("lower(nome)"),
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    nome: Mapped[str] = mapped_column(String(40))
    capacidade: Mapped[int | None] = mapped_column(SmallInteger)
    # ocupada/aguardando_pagamento seguem a comanda; reservada/bloqueada são manuais.
    status: Mapped[str] = mapped_column(String(25), default="livre", server_default="livre")
    ativa: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
