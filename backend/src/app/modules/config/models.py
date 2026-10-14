from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Numeric,
    SmallInteger,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ConfiguracaoEmpresa(Base):
    """Linha única (id = 1) com as configurações editáveis da empresa."""

    __tablename__ = "configuracao_empresa"
    __table_args__ = (CheckConstraint("id = 1", name="linha_unica"),)

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, default=1)
    nome_exibicao: Mapped[str] = mapped_column(String(120))
    timezone: Mapped[str] = mapped_column(String(64))
    # Taxa de serviço (%) aplicada às comandas novas; 0 = sem taxa.
    taxa_servico_pct: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal(0), server_default="0"
    )
    # Minutos em que quem lançou o item pode cancelá-lo sem gerente.
    cancelamento_janela_min: Mapped[int] = mapped_column(
        SmallInteger, default=5, server_default="5"
    )
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("usuario.id"))
