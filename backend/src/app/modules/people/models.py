from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Identity,
    Index,
    Numeric,
    String,
    Text,
    text,
)
from sqlalchemy.ext.associationproxy import AssociationProxy, association_proxy
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Autoria, Base

PAPEIS_PESSOA = ("cliente", "fornecedor", "colaborador")


class PessoaPapel(Base):
    __tablename__ = "pessoa_papel"
    __table_args__ = (
        CheckConstraint("papel IN ('cliente', 'fornecedor', 'colaborador')", name="papel"),
    )

    pessoa_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("pessoa.id", ondelete="CASCADE"), primary_key=True
    )
    papel: Mapped[str] = mapped_column(String(20), primary_key=True)


class PessoaEndereco(Base):
    __tablename__ = "pessoa_endereco"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    pessoa_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("pessoa.id", ondelete="CASCADE"), index=True
    )
    rotulo: Mapped[str | None] = mapped_column(String(30))
    cep: Mapped[str | None] = mapped_column(String(8))
    logradouro: Mapped[str] = mapped_column(String(160))
    numero: Mapped[str | None] = mapped_column(String(20))
    complemento: Mapped[str | None] = mapped_column(String(80))
    bairro: Mapped[str | None] = mapped_column(String(80))
    cidade: Mapped[str] = mapped_column(String(80))
    uf: Mapped[str] = mapped_column(String(2))
    principal: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")


class PessoaCliente(Base):
    __tablename__ = "pessoa_cliente"

    pessoa_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("pessoa.id", ondelete="CASCADE"), primary_key=True
    )
    aceita_fiado: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    limite_fiado: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0"), server_default="0"
    )


class Pessoa(Autoria, Base):
    __tablename__ = "pessoa"
    __table_args__ = (
        CheckConstraint("tipo IN ('F', 'J')", name="tipo"),
        Index(
            "uq_pessoa_documento_ativo",
            "documento",
            unique=True,
            postgresql_where=text("documento IS NOT NULL AND deleted_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    tipo: Mapped[str] = mapped_column(String(1))  # F = pessoa física, J = jurídica
    nome: Mapped[str] = mapped_column(String(160))
    nome_fantasia: Mapped[str | None] = mapped_column(String(160))
    documento: Mapped[str | None] = mapped_column(String(14))  # só dígitos
    telefone: Mapped[str | None] = mapped_column(String(20))
    whatsapp: Mapped[str | None] = mapped_column(String(20))
    email: Mapped[str | None] = mapped_column(String(254))
    observacoes: Mapped[str | None] = mapped_column(Text)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    papeis_rel: Mapped[list[PessoaPapel]] = relationship(
        cascade="all, delete-orphan", lazy="selectin", order_by=PessoaPapel.papel
    )
    papeis: AssociationProxy[list[str]] = association_proxy(
        "papeis_rel", "papel", creator=lambda papel: PessoaPapel(papel=papel)
    )
    enderecos: Mapped[list[PessoaEndereco]] = relationship(
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by=(PessoaEndereco.principal.desc(), PessoaEndereco.id),
    )
    cliente: Mapped[PessoaCliente | None] = relationship(
        cascade="all, delete-orphan", lazy="selectin", uselist=False
    )
