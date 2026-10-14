from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    ForeignKey,
    Identity,
    Index,
    Numeric,
    String,
    Table,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Autoria, Base

papel_permissao = Table(
    "papel_permissao",
    Base.metadata,
    Column("papel_id", BigInteger, ForeignKey("papel.id", ondelete="CASCADE"), primary_key=True),
    Column(
        "permissao_id", BigInteger, ForeignKey("permissao.id", ondelete="CASCADE"), primary_key=True
    ),
)

usuario_papel = Table(
    "usuario_papel",
    Base.metadata,
    Column(
        "usuario_id", BigInteger, ForeignKey("usuario.id", ondelete="CASCADE"), primary_key=True
    ),
    Column("papel_id", BigInteger, ForeignKey("papel.id"), primary_key=True),
)


class Permissao(Base):
    __tablename__ = "permissao"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    codigo: Mapped[str] = mapped_column(String(80), unique=True)  # modulo.acao
    modulo: Mapped[str] = mapped_column(String(40))
    descricao: Mapped[str] = mapped_column(Text)


class Papel(Autoria, Base):
    __tablename__ = "papel"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    nome: Mapped[str] = mapped_column(String(60))
    descricao: Mapped[str | None] = mapped_column(Text)
    # Papéis de sistema não podem ser apagados nem renomeados.
    sistema: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # Maior desconto (% do subtotal da comanda) que quem tem este papel pode aplicar sem um gerente.
    limite_desconto_pct: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal(0), server_default="0"
    )

    __table_args__ = (
        Index(
            "uq_papel_nome_ativo",
            text("lower(nome)"),
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    permissoes: Mapped[list[Permissao]] = relationship(
        secondary=papel_permissao, order_by=Permissao.codigo, lazy="selectin"
    )
