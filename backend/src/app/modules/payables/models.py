from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
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


class TituloPagar(Autoria, Base):
    """Conta a pagar. O `status` guardado é só aberto/pago/cancelado: "vencido" é calculado a
    partir do vencimento e do dia de hoje no fuso da empresa (ver `service.situacao_de`)."""

    __tablename__ = "titulo_pagar"
    __table_args__ = (
        CheckConstraint("status IN ('aberto', 'pago', 'cancelado')", name="status"),
        CheckConstraint("valor_original > 0", name="valor_positivo"),
        CheckConstraint(
            "valor_pago >= 0 AND valor_pago <= valor_original", name="pago_dentro_do_valor"
        ),
        Index("ix_titulo_pagar_status_vencimento", "status", "vencimento"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    # Despesa sem fornecedor cadastrado (conta de luz, taxa avulsa) é válida: pessoa fica nula.
    pessoa_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("pessoa.id"), index=True)
    categoria_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("categoria_financeira.id"), index=True
    )
    descricao: Mapped[str] = mapped_column(String(200))
    documento: Mapped[str | None] = mapped_column(String(60))  # nota, boleto
    valor_original: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    # Soma líquida das baixas (estornos entram com valor negativo); mantido sob trava do título.
    valor_pago: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal(0), server_default="0"
    )
    vencimento: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(10), default="aberto", server_default="aberto")
    cancelado_motivo: Mapped[str | None] = mapped_column(Text)
    observacao: Mapped[str | None] = mapped_column(Text)

    baixas: Mapped[list["TituloPagarBaixa"]] = relationship(
        lazy="selectin", order_by="TituloPagarBaixa.id"
    )


class TituloPagarBaixa(Base):
    """Pagamento (valor > 0) ou seu estorno (valor < 0, com estorno_de_id). Append-only.

    Registro financeiro/gerencial: não movimenta o caixa (ver docs/decisoes/0007)."""

    __tablename__ = "titulo_pagar_baixa"
    __table_args__ = (
        CheckConstraint("valor <> 0", name="valor_nao_zero"),
        UniqueConstraint("estorno_de_id", name="uq_titulo_pagar_baixa_estorno_de"),
        # Reenvio do mesmo pagamento (clique duplo, retry de rede) não lança duas vezes.
        Index(
            "uq_titulo_pagar_baixa_chave",
            "titulo_id",
            "chave_idempotencia",
            unique=True,
            postgresql_where=text("chave_idempotencia IS NOT NULL"),
        ),
        Index("ix_titulo_pagar_baixa_data_pagamento", "data_pagamento"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    titulo_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("titulo_pagar.id"), index=True)
    valor: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    # Informativa: o pagamento não entra no caixa, então a forma não tem efeito contábil.
    forma_pagamento_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("forma_pagamento.id"))
    # Dia do pagamento no calendário da empresa. O estorno herda o dia da baixa original, para o
    # "pago no mês" refletir o que de fato ficou pago em cada mês.
    data_pagamento: Mapped[date] = mapped_column(Date)
    estorno_de_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("titulo_pagar_baixa.id")
    )
    chave_idempotencia: Mapped[str | None] = mapped_column(String(64))
    observacao: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("usuario.id"))
