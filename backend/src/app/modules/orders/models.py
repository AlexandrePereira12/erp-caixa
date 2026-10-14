from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Numeric,
    SmallInteger,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Autoria, Base


class Comanda(Autoria, Base):
    __tablename__ = "comanda"
    __table_args__ = (
        CheckConstraint("tipo IN ('mesa', 'balcao', 'retirada', 'delivery')", name="tipo"),
        CheckConstraint(
            "status IN ('aberta', 'aguardando_pagamento', 'fechada', 'cancelada')", name="status"
        ),
        CheckConstraint("tipo <> 'mesa' OR mesa_id IS NOT NULL", name="mesa_obrigatoria"),
        # Uma mesa só tem uma comanda em andamento: o banco recusa a segunda, mesmo em corrida.
        Index(
            "uq_comanda_mesa_em_andamento",
            "mesa_id",
            unique=True,
            postgresql_where=text("status IN ('aberta', 'aguardando_pagamento')"),
        ),
        Index("ix_comanda_status", "status"),
        Index("ix_comanda_cliente", "cliente_id"),
        Index("ix_comanda_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    tipo: Mapped[str] = mapped_column(String(10))
    mesa_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("mesa.id"))
    cliente_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("pessoa.id"))
    nome_cliente: Mapped[str | None] = mapped_column(String(120))
    endereco_entrega: Mapped[str | None] = mapped_column(Text)
    num_pessoas: Mapped[int | None] = mapped_column(SmallInteger)
    observacao: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(25), default="aberta", server_default="aberta")
    # Taxa de serviço vigente na abertura (% sobre o consumo já com desconto).
    taxa_servico_pct: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal(0), server_default="0"
    )
    fechada_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelada_motivo: Mapped[str | None] = mapped_column(Text)

    itens: Mapped[list["ComandaItem"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin", order_by="ComandaItem.id"
    )
    ajustes: Mapped[list["ComandaAjuste"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin", order_by="ComandaAjuste.id"
    )
    mesa = relationship("Mesa", lazy="joined")
    cliente = relationship("Pessoa", lazy="joined")


class ComandaItem(Autoria, Base):
    __tablename__ = "comanda_item"
    __table_args__ = (
        CheckConstraint("status IN ('ativo', 'cancelado')", name="status"),
        CheckConstraint("quantidade > 0", name="quantidade_positiva"),
        CheckConstraint("preco_unitario >= 0", name="preco_nao_negativo"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    comanda_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("comanda.id", ondelete="CASCADE"), index=True
    )
    produto_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("produto.id"))
    descricao: Mapped[str] = mapped_column(String(160))  # nome do produto no momento do lançamento
    quantidade: Mapped[Decimal] = mapped_column(Numeric(14, 3))
    preco_unitario: Mapped[Decimal] = mapped_column(Numeric(14, 2))  # congelado no lançamento
    observacao: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10), default="ativo", server_default="ativo")
    cancelado_motivo: Mapped[str | None] = mapped_column(Text)
    cancelado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelado_por: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("usuario.id"))

    produto = relationship("Produto", lazy="joined")


class ComandaAjuste(Autoria, Base):
    __tablename__ = "comanda_ajuste"
    __table_args__ = (
        CheckConstraint("tipo IN ('desconto', 'acrescimo')", name="tipo"),
        CheckConstraint("modo IN ('valor', 'percentual')", name="modo"),
        CheckConstraint("valor > 0", name="valor_positivo"),
        CheckConstraint("modo <> 'percentual' OR valor <= 100", name="percentual_ate_100"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    comanda_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("comanda.id", ondelete="CASCADE"), index=True
    )
    tipo: Mapped[str] = mapped_column(String(10))
    modo: Mapped[str] = mapped_column(String(10))
    # modo 'valor': reais; modo 'percentual': % sobre o subtotal dos itens ativos.
    valor: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    justificativa: Mapped[str] = mapped_column(Text)
    removido_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    removido_por: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("usuario.id"))


class ComandaEvento(Base):
    """Linha do tempo da comanda. Append-only."""

    __tablename__ = "comanda_evento"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    comanda_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("comanda.id"), index=True)
    tipo: Mapped[str] = mapped_column(String(30))
    descricao: Mapped[str] = mapped_column(Text)
    dados: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("usuario.id"))
