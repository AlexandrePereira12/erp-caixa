from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Autoria, Base

TIPOS_MOVIMENTO = ("entrada", "saida", "perda", "ajuste", "inventario", "venda", "estorno_venda")


class EstoqueSaldo(Base):
    __tablename__ = "estoque_saldo"

    produto_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("produto.id"), primary_key=True)
    # Pode ficar negativo apenas por override autorizado (estoque.permitir_negativo).
    quantidade: Mapped[Decimal] = mapped_column(
        Numeric(14, 3), default=Decimal("0"), server_default="0"
    )
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class MovimentoEstoque(Base):
    """Append-only: correção é um novo movimento, nunca alteração do antigo."""

    __tablename__ = "movimento_estoque"
    __table_args__ = (
        CheckConstraint(
            "tipo IN ('entrada', 'saida', 'perda', 'ajuste', 'inventario', 'venda', 'estorno_venda')",
            name="tipo",
        ),
        CheckConstraint("quantidade <> 0", name="quantidade_nao_zero"),
        # Idempotência: a mesma origem (venda, inventário…) nunca movimenta o mesmo produto duas vezes.
        Index(
            "uq_movimento_estoque_origem",
            "origem_tipo",
            "origem_id",
            "produto_id",
            unique=True,
            postgresql_where=text("origem_id IS NOT NULL"),
        ),
        Index("ix_movimento_estoque_produto_data", "produto_id", "ocorrido_em"),
        Index("ix_movimento_estoque_ocorrido", "ocorrido_em", "id"),
        Index("ix_movimento_estoque_tipo_data", "tipo", "ocorrido_em"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    produto_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("produto.id"))
    tipo: Mapped[str] = mapped_column(String(20))
    # Variação com sinal: positiva entra, negativa sai.
    quantidade: Mapped[Decimal] = mapped_column(Numeric(14, 3))
    saldo_apos: Mapped[Decimal] = mapped_column(Numeric(14, 3))
    custo_unitario: Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    origem_tipo: Mapped[str | None] = mapped_column(String(30))
    origem_id: Mapped[int | None] = mapped_column(BigInteger)
    documento: Mapped[str | None] = mapped_column(String(60))
    justificativa: Mapped[str | None] = mapped_column(Text)
    # Só em entradas (compras), e opcional: entrada sem nota/fornecedor continua válida. Sem
    # relationship de propósito: o nome vem por JOIN explícito nas consultas (Pessoa carrega
    # coleções em cascata e encareceria todo movimento lido).
    fornecedor_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("pessoa.id"), index=True
    )
    ocorrido_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    created_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("usuario.id"))

    produto = relationship("Produto", lazy="joined")


class Inventario(Autoria, Base):
    __tablename__ = "inventario"
    __table_args__ = (
        CheckConstraint("status IN ('aberto', 'fechado', 'cancelado')", name="status"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    descricao: Mapped[str] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(12), default="aberto", server_default="aberto")
    fechado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fechado_por: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("usuario.id"))

    itens: Mapped[list["InventarioItem"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin", order_by="InventarioItem.produto_id"
    )


class InventarioItem(Base):
    __tablename__ = "inventario_item"
    __table_args__ = (
        UniqueConstraint("inventario_id", "produto_id", name="uq_inventario_item_produto"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    inventario_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("inventario.id", ondelete="CASCADE"), index=True
    )
    produto_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("produto.id"))
    quantidade_sistema: Mapped[Decimal] = mapped_column(Numeric(14, 3))
    quantidade_contada: Mapped[Decimal | None] = mapped_column(Numeric(14, 3))
    # Preenchida no fechamento: contada - saldo vigente naquele momento.
    diferenca: Mapped[Decimal | None] = mapped_column(Numeric(14, 3))

    produto = relationship("Produto", lazy="joined")
