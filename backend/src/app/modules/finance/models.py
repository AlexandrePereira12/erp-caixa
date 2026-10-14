from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
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


class CategoriaFinanceira(Autoria, Base):
    __tablename__ = "categoria_financeira"
    __table_args__ = (
        CheckConstraint("tipo IN ('receita', 'despesa')", name="tipo"),
        Index(
            "uq_categoria_financeira_nome_tipo_ativa",
            text("lower(nome)"),
            "tipo",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    nome: Mapped[str] = mapped_column(String(80))
    tipo: Mapped[str] = mapped_column(String(10))
    ativa: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")


class TituloReceber(Autoria, Base):
    __tablename__ = "titulo_receber"
    __table_args__ = (
        CheckConstraint("status IN ('aberto', 'pago', 'cancelado')", name="status"),
        CheckConstraint("valor_original > 0", name="valor_positivo"),
        CheckConstraint(
            "valor_pago >= 0 AND valor_pago <= valor_original", name="pago_dentro_do_valor"
        ),
        # Cada pagamento em fiado gera exatamente um título.
        UniqueConstraint("venda_pagamento_id", name="uq_titulo_receber_venda_pagamento"),
        Index("ix_titulo_receber_status", "status"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    pessoa_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("pessoa.id"), index=True)
    venda_pagamento_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("venda_pagamento.id")
    )
    categoria_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("categoria_financeira.id")
    )
    descricao: Mapped[str] = mapped_column(String(200))
    valor_original: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    # Soma líquida das baixas (estornos entram com valor negativo); mantido sob trava do título.
    valor_pago: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal(0), server_default="0"
    )
    vencimento: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(10), default="aberto", server_default="aberto")
    cancelado_motivo: Mapped[str | None] = mapped_column(Text)

    pessoa = relationship("Pessoa", lazy="joined")
    baixas: Mapped[list["TituloReceberBaixa"]] = relationship(
        lazy="selectin", order_by="TituloReceberBaixa.id"
    )


class TituloReceberBaixa(Base):
    """Recebimento (valor > 0) ou seu estorno (valor < 0, com estorno_de_id). Append-only."""

    __tablename__ = "titulo_receber_baixa"
    __table_args__ = (
        CheckConstraint("valor <> 0", name="valor_nao_zero"),
        UniqueConstraint("estorno_de_id", name="uq_titulo_receber_baixa_estorno_de"),
        # Reenvio da mesma baixa (clique duplo, retry de rede) não lança duas vezes.
        Index(
            "uq_titulo_baixa_chave",
            "titulo_id",
            "chave_idempotencia",
            unique=True,
            postgresql_where=text("chave_idempotencia IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    titulo_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("titulo_receber.id"), index=True)
    valor: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    forma_pagamento_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("forma_pagamento.id"))
    caixa_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("caixa.id"))
    estorno_de_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("titulo_receber_baixa.id")
    )
    chave_idempotencia: Mapped[str | None] = mapped_column(String(64))
    observacao: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("usuario.id"))
