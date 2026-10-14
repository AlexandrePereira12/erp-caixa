from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Autoria, Base

TIPOS_FORMA = ("dinheiro", "pix", "debito", "credito", "vale", "fiado", "outro")


class FormaPagamento(Autoria, Base):
    __tablename__ = "forma_pagamento"
    __table_args__ = (
        CheckConstraint(
            "tipo IN ('dinheiro', 'pix', 'debito', 'credito', 'vale', 'fiado', 'outro')",
            name="tipo",
        ),
        # Só uma forma de dinheiro (caixa/sangria/troco) e uma de fiado (gera título) ativas.
        Index(
            "uq_forma_pagamento_tipo_unico",
            "tipo",
            unique=True,
            postgresql_where=text("tipo IN ('dinheiro', 'fiado') AND deleted_at IS NULL"),
        ),
        Index(
            "uq_forma_pagamento_nome_ativa",
            text("lower(nome)"),
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    nome: Mapped[str] = mapped_column(String(60))
    # O tipo define o comportamento: 'dinheiro' admite troco; 'fiado' gera conta a receber e não
    # entra no caixa; os demais entram no caixa na hora.
    tipo: Mapped[str] = mapped_column(String(10))
    ativa: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    ordem: Mapped[int] = mapped_column(SmallInteger, default=0, server_default="0")


class Caixa(Autoria, Base):
    __tablename__ = "caixa"
    __table_args__ = (
        CheckConstraint("status IN ('aberto', 'fechado')", name="status"),
        CheckConstraint("valor_abertura >= 0", name="abertura_nao_negativa"),
        # Um caixa aberto por operador (MVP): garantido pelo banco.
        Index(
            "uq_caixa_operador_aberto",
            "operador_id",
            unique=True,
            postgresql_where=text("status = 'aberto'"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    operador_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("usuario.id"), index=True)
    status: Mapped[str] = mapped_column(String(10), default="aberto", server_default="aberto")
    valor_abertura: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    aberto_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    fechado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fechado_por: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("usuario.id"))
    # Quantas vezes o caixa já foi fechado (reabertura permite novo fechamento).
    rodada: Mapped[int] = mapped_column(SmallInteger, default=1, server_default="1")

    operador = relationship("Usuario", foreign_keys=[operador_id], lazy="joined")


class CaixaEvento(Base):
    """Abertura, fechamento e reabertura do caixa. Append-only."""

    __tablename__ = "caixa_evento"
    __table_args__ = (
        CheckConstraint("tipo IN ('abertura', 'fechamento', 'reabertura')", name="tipo"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    caixa_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("caixa.id"), index=True)
    tipo: Mapped[str] = mapped_column(String(12))
    justificativa: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("usuario.id"))


class MovimentoCaixa(Base):
    """Todo valor que entra ou sai do caixa tem origem e fica aqui. Append-only:
    correção é um estorno (valor oposto), nunca alteração do lançamento."""

    __tablename__ = "movimento_caixa"
    __table_args__ = (
        CheckConstraint(
            "tipo IN ('abertura', 'venda', 'recebimento', 'sangria', 'reforco', "
            "'estorno_venda', 'estorno_recebimento')",
            name="tipo",
        ),
        CheckConstraint("valor <> 0", name="valor_nao_zero"),
        # A mesma origem (pagamento, baixa…) nunca gera dois lançamentos.
        Index("ix_movimento_caixa_forma", "forma_pagamento_id"),
        Index(
            "uq_movimento_caixa_origem",
            "origem_tipo",
            "origem_id",
            unique=True,
            postgresql_where=text("origem_id IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    caixa_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("caixa.id"), index=True)
    tipo: Mapped[str] = mapped_column(String(25))
    forma_pagamento_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("forma_pagamento.id"))
    # Com sinal: positivo entra no caixa, negativo sai.
    valor: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    origem_tipo: Mapped[str | None] = mapped_column(String(30))
    origem_id: Mapped[int | None] = mapped_column(BigInteger)
    descricao: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("usuario.id"))

    forma_pagamento = relationship("FormaPagamento", lazy="joined")


class CaixaConferencia(Base):
    __tablename__ = "caixa_conferencia"
    __table_args__ = (
        UniqueConstraint(
            "caixa_id", "rodada", "forma_pagamento_id", name="uq_caixa_conferencia_rodada_forma"
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    caixa_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("caixa.id"), index=True)
    rodada: Mapped[int] = mapped_column(SmallInteger)
    forma_pagamento_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("forma_pagamento.id"))
    valor_esperado: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    valor_contado: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    diferenca: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    justificativa: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("usuario.id"))

    forma_pagamento = relationship("FormaPagamento", lazy="joined")
