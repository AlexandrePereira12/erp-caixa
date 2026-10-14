from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class Venda(Base):
    """Nasce no fechamento da comanda e não é alterada depois (estorno = venda_estorno)."""

    __tablename__ = "venda"
    __table_args__ = (
        # Garantia final de que uma comanda gera no máximo uma venda.
        UniqueConstraint("comanda_id", name="uq_venda_comanda"),
        CheckConstraint("total >= 0", name="total_nao_negativo"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    comanda_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("comanda.id"))
    caixa_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("caixa.id"), index=True)
    cliente_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("pessoa.id"), index=True)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    desconto_total: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    acrescimo_total: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    taxa_servico: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    created_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("usuario.id"))

    itens: Mapped[list["VendaItem"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin", order_by="VendaItem.id"
    )
    pagamentos: Mapped[list["VendaPagamento"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin", order_by="VendaPagamento.id"
    )
    estorno: Mapped["VendaEstorno | None"] = relationship(lazy="selectin", uselist=False)
    cliente = relationship("Pessoa", lazy="joined")


class VendaItem(Base):
    __tablename__ = "venda_item"
    __table_args__ = (UniqueConstraint("comanda_item_id", name="uq_venda_item_comanda_item"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    venda_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("venda.id"), index=True)
    comanda_item_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("comanda_item.id"))
    produto_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("produto.id"), index=True)
    descricao: Mapped[str] = mapped_column(String(160))
    quantidade: Mapped[Decimal] = mapped_column(Numeric(14, 3))
    preco_unitario: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2))


class VendaPagamento(Base):
    __tablename__ = "venda_pagamento"
    __table_args__ = (CheckConstraint("valor > 0", name="valor_positivo"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    venda_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("venda.id"), index=True)
    forma_pagamento_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("forma_pagamento.id"))
    valor: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    valor_recebido: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))  # só dinheiro
    troco: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    parcelas: Mapped[int | None] = mapped_column(SmallInteger)
    observacao: Mapped[str | None] = mapped_column(Text)

    forma_pagamento = relationship("FormaPagamento", lazy="joined")


class VendaEstorno(Base):
    __tablename__ = "venda_estorno"
    __table_args__ = (UniqueConstraint("venda_id", name="uq_venda_estorno_venda"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    venda_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("venda.id"))
    motivo: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("usuario.id"))
