"""fundacao: usuários, papéis, permissões, sessões, auditoria e configuração da empresa

Revision ID: 0001
Revises:
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.core.migration_helpers import (
    criar_funcao_append_only,
    remover_funcao_append_only,
    tornar_append_only,
)

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "auditoria_log",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column(
            "ocorrido_em",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("usuario_id", sa.BigInteger(), nullable=True),
        sa.Column("usuario_nome", sa.String(length=120), nullable=True),
        sa.Column("papel", sa.String(length=200), nullable=True),
        sa.Column("ip", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=300), nullable=True),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("acao", sa.String(length=40), nullable=False),
        sa.Column("modulo", sa.String(length=40), nullable=False),
        sa.Column("recurso", sa.String(length=60), nullable=False),
        sa.Column("recurso_id", sa.String(length=60), nullable=True),
        sa.Column("descricao", sa.Text(), nullable=False),
        sa.Column("antes", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("depois", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("campos_alterados", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_auditoria_log")),
    )
    op.create_index("ix_auditoria_log_acao", "auditoria_log", ["acao"], unique=False)
    op.create_index("ix_auditoria_log_ocorrido_em", "auditoria_log", ["ocorrido_em"], unique=False)
    op.create_index(
        "ix_auditoria_log_recurso",
        "auditoria_log",
        ["modulo", "recurso", "recurso_id"],
        unique=False,
    )
    op.create_index("ix_auditoria_log_request_id", "auditoria_log", ["request_id"], unique=False)
    op.create_index("ix_auditoria_log_usuario_id", "auditoria_log", ["usuario_id"], unique=False)
    op.create_table(
        "permissao",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("codigo", sa.String(length=80), nullable=False),
        sa.Column("modulo", sa.String(length=40), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_permissao")),
        sa.UniqueConstraint("codigo", name=op.f("uq_permissao_codigo")),
    )
    op.create_table(
        "usuario",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("nome", sa.String(length=120), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("senha_hash", sa.String(length=255), nullable=False),
        sa.Column("suspenso", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("must_change_password", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("ultimo_login_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_by", sa.BigInteger(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", sa.BigInteger(), nullable=True),
        sa.ForeignKeyConstraint(
            ["created_by"], ["usuario.id"], name=op.f("fk_usuario_created_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by"], ["usuario.id"], name=op.f("fk_usuario_deleted_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["usuario.id"], name=op.f("fk_usuario_updated_by_usuario")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_usuario")),
    )
    op.create_index(
        "uq_usuario_email_ativo",
        "usuario",
        [sa.literal_column("lower(email)")],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_table(
        "configuracao_empresa",
        sa.Column("id", sa.SmallInteger(), nullable=False),
        sa.Column("nome_exibicao", sa.String(length=120), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_by", sa.BigInteger(), nullable=True),
        sa.CheckConstraint("id = 1", name=op.f("ck_configuracao_empresa_linha_unica")),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["usuario.id"], name=op.f("fk_configuracao_empresa_updated_by_usuario")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_configuracao_empresa")),
    )
    op.create_table(
        "papel",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("nome", sa.String(length=60), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("sistema", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_by", sa.BigInteger(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", sa.BigInteger(), nullable=True),
        sa.ForeignKeyConstraint(
            ["created_by"], ["usuario.id"], name=op.f("fk_papel_created_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by"], ["usuario.id"], name=op.f("fk_papel_deleted_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["usuario.id"], name=op.f("fk_papel_updated_by_usuario")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_papel")),
    )
    op.create_index(
        "uq_papel_nome_ativo",
        "papel",
        [sa.literal_column("lower(nome)")],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_table(
        "refresh_token",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("usuario_id", sa.BigInteger(), nullable=False),
        sa.Column("familia_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "criado_em", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("expira_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revogado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("substituido_por_id", sa.BigInteger(), nullable=True),
        sa.Column("ip", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=300), nullable=True),
        sa.ForeignKeyConstraint(
            ["substituido_por_id"],
            ["refresh_token.id"],
            name=op.f("fk_refresh_token_substituido_por_id_refresh_token"),
        ),
        sa.ForeignKeyConstraint(
            ["usuario_id"],
            ["usuario.id"],
            name=op.f("fk_refresh_token_usuario_id_usuario"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_refresh_token")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_refresh_token_token_hash")),
    )
    op.create_index(
        op.f("ix_refresh_token_familia_id"), "refresh_token", ["familia_id"], unique=False
    )
    op.create_index(
        op.f("ix_refresh_token_usuario_id"), "refresh_token", ["usuario_id"], unique=False
    )
    op.create_table(
        "papel_permissao",
        sa.Column("papel_id", sa.BigInteger(), nullable=False),
        sa.Column("permissao_id", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(
            ["papel_id"],
            ["papel.id"],
            name=op.f("fk_papel_permissao_papel_id_papel"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["permissao_id"],
            ["permissao.id"],
            name=op.f("fk_papel_permissao_permissao_id_permissao"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("papel_id", "permissao_id", name=op.f("pk_papel_permissao")),
    )
    op.create_table(
        "usuario_papel",
        sa.Column("usuario_id", sa.BigInteger(), nullable=False),
        sa.Column("papel_id", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(
            ["papel_id"], ["papel.id"], name=op.f("fk_usuario_papel_papel_id_papel")
        ),
        sa.ForeignKeyConstraint(
            ["usuario_id"],
            ["usuario.id"],
            name=op.f("fk_usuario_papel_usuario_id_usuario"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("usuario_id", "papel_id", name=op.f("pk_usuario_papel")),
    )

    # Auditoria é append-only: privilégio revogado do role app + trigger que vale até para o owner.
    criar_funcao_append_only(op)
    tornar_append_only(op, "auditoria_log")


def downgrade() -> None:
    op.drop_table("usuario_papel")
    op.drop_table("papel_permissao")
    op.drop_index(op.f("ix_refresh_token_usuario_id"), table_name="refresh_token")
    op.drop_index(op.f("ix_refresh_token_familia_id"), table_name="refresh_token")
    op.drop_table("refresh_token")
    op.drop_index(
        "uq_papel_nome_ativo", table_name="papel", postgresql_where=sa.text("deleted_at IS NULL")
    )
    op.drop_table("papel")
    op.drop_table("configuracao_empresa")
    op.drop_index(
        "uq_usuario_email_ativo",
        table_name="usuario",
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.drop_table("usuario")
    op.drop_table("permissao")
    op.drop_index("ix_auditoria_log_usuario_id", table_name="auditoria_log")
    op.drop_index("ix_auditoria_log_request_id", table_name="auditoria_log")
    op.drop_index("ix_auditoria_log_recurso", table_name="auditoria_log")
    op.drop_index("ix_auditoria_log_ocorrido_em", table_name="auditoria_log")
    op.drop_index("ix_auditoria_log_acao", table_name="auditoria_log")
    op.drop_table("auditoria_log")
    remover_funcao_append_only(op)
