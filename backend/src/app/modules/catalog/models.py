from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Identity,
    Index,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Autoria, Base

TIPOS_PRODUTO = ("revenda", "preparado", "insumo", "embalagem")


class UnidadeMedida(Autoria, Base):
    __tablename__ = "unidade_medida"
    __table_args__ = (
        Index(
            "uq_unidade_medida_sigla_ativa",
            text("lower(sigla)"),
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    sigla: Mapped[str] = mapped_column(String(10))
    nome: Mapped[str] = mapped_column(String(60))
    # Casas decimais aceitas em quantidades desta unidade (UN = 0, KG = 3).
    casas_decimais: Mapped[int] = mapped_column(SmallInteger, default=0, server_default="0")


class CategoriaProduto(Autoria, Base):
    __tablename__ = "categoria_produto"
    __table_args__ = (
        Index(
            "uq_categoria_produto_nome_ativa",
            text("lower(nome)"),
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    nome: Mapped[str] = mapped_column(String(80))
    descricao: Mapped[str | None] = mapped_column(Text)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")


class ProdutoComposicao(Base):
    """Ficha técnica simples (um nível): o produto preparado consome estes insumos por unidade."""

    __tablename__ = "produto_composicao"
    __table_args__ = (
        UniqueConstraint("produto_id", "insumo_id", name="uq_produto_composicao_insumo"),
        CheckConstraint("quantidade > 0", name="quantidade_positiva"),
        CheckConstraint("produto_id <> insumo_id", name="sem_autoreferencia"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    produto_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("produto.id", ondelete="CASCADE"), index=True
    )
    insumo_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("produto.id"), index=True)
    quantidade: Mapped[Decimal] = mapped_column(Numeric(14, 3))


class Produto(Autoria, Base):
    __tablename__ = "produto"
    __table_args__ = (
        CheckConstraint("tipo IN ('revenda', 'preparado', 'insumo', 'embalagem')", name="tipo"),
        CheckConstraint("preco_venda >= 0", name="preco_nao_negativo"),
        CheckConstraint("estoque_minimo >= 0", name="minimo_nao_negativo"),
        Index(
            "uq_produto_codigo_ativo",
            "codigo",
            unique=True,
            postgresql_where=text("codigo IS NOT NULL AND deleted_at IS NULL"),
        ),
        Index(
            "uq_produto_codigo_barras_ativo",
            "codigo_barras",
            unique=True,
            postgresql_where=text("codigo_barras IS NOT NULL AND deleted_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    nome: Mapped[str] = mapped_column(String(160))
    tipo: Mapped[str] = mapped_column(String(20))
    categoria_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("categoria_produto.id"), index=True
    )
    unidade_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("unidade_medida.id"))
    codigo: Mapped[str | None] = mapped_column(String(40))
    codigo_barras: Mapped[str | None] = mapped_column(String(32))
    preco_venda: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0"), server_default="0"
    )
    custo_medio: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), default=Decimal("0"), server_default="0"
    )
    estoque_minimo: Mapped[Decimal] = mapped_column(
        Numeric(14, 3), default=Decimal("0"), server_default="0"
    )
    # Sem composição, um produto com controla_estoque baixa o próprio saldo na venda.
    controla_estoque: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # Insumos e embalagens normalmente não aparecem no cardápio.
    vendavel: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    categoria: Mapped[CategoriaProduto | None] = relationship(lazy="joined")
    unidade: Mapped[UnidadeMedida] = relationship(lazy="joined")
    composicao: Mapped[list[ProdutoComposicao]] = relationship(
        foreign_keys=[ProdutoComposicao.produto_id],
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by=ProdutoComposicao.id,
    )
