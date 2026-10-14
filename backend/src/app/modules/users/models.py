from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Identity, Index, SmallInteger, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Autoria, Base
from app.modules.rbac.models import Papel, usuario_papel


class Usuario(Autoria, Base):
    __tablename__ = "usuario"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    nome: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(254))
    senha_hash: Mapped[str] = mapped_column(String(255))
    suspenso: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    ultimo_login_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Falhas seguidas de login; ao passar do limite a conta fica bloqueada por um tempo.
    falhas_login: Mapped[int] = mapped_column(SmallInteger, default=0, server_default="0")
    bloqueado_ate: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Access tokens emitidos antes deste instante deixam de valer (logout, troca de senha, suspensão).
    tokens_invalidos_ate: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        # E-mail único entre usuários não excluídos (permite reaproveitar após exclusão lógica).
        Index(
            "uq_usuario_email_ativo",
            text("lower(email)"),
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    papeis: Mapped[list[Papel]] = relationship(
        secondary=usuario_papel, order_by=Papel.nome, lazy="selectin"
    )
