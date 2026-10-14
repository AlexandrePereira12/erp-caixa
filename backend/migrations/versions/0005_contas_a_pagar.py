"""contas a pagar (título e baixas), fornecedor na entrada de estoque e categorias de despesa

Revision ID: 0005
Revises: 0004
"""

import sqlalchemy as sa
from alembic import op

from app.core.migration_helpers import remover_append_only, tornar_append_only

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

CATEGORIAS_DESPESA = (
    "Mercadorias e insumos",
    "Aluguel",
    "Energia e água",
    "Pessoal",
    "Impostos e taxas",
    "Manutenção",
    "Outras despesas",
)


def upgrade() -> None:
    op.create_table(
        "titulo_pagar",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("pessoa_id", sa.BigInteger(), nullable=True),
        sa.Column("categoria_id", sa.BigInteger(), nullable=True),
        sa.Column("descricao", sa.String(length=200), nullable=False),
        sa.Column("documento", sa.String(length=60), nullable=True),
        sa.Column("valor_original", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column(
            "valor_pago", sa.Numeric(precision=14, scale=2), server_default="0", nullable=False
        ),
        sa.Column("vencimento", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=10), server_default="aberto", nullable=False),
        sa.Column("cancelado_motivo", sa.Text(), nullable=True),
        sa.Column("observacao", sa.Text(), nullable=True),
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
        sa.CheckConstraint(
            "status IN ('aberto', 'pago', 'cancelado')", name=op.f("ck_titulo_pagar_status")
        ),
        sa.CheckConstraint("valor_original > 0", name=op.f("ck_titulo_pagar_valor_positivo")),
        sa.CheckConstraint(
            "valor_pago >= 0 AND valor_pago <= valor_original",
            name=op.f("ck_titulo_pagar_pago_dentro_do_valor"),
        ),
        sa.ForeignKeyConstraint(
            ["categoria_id"],
            ["categoria_financeira.id"],
            name=op.f("fk_titulo_pagar_categoria_id_categoria_financeira"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["usuario.id"], name=op.f("fk_titulo_pagar_created_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by"], ["usuario.id"], name=op.f("fk_titulo_pagar_deleted_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["pessoa_id"], ["pessoa.id"], name=op.f("fk_titulo_pagar_pessoa_id_pessoa")
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["usuario.id"], name=op.f("fk_titulo_pagar_updated_by_usuario")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_titulo_pagar")),
    )
    op.create_index(op.f("ix_titulo_pagar_pessoa_id"), "titulo_pagar", ["pessoa_id"], unique=False)
    op.create_index(
        op.f("ix_titulo_pagar_categoria_id"), "titulo_pagar", ["categoria_id"], unique=False
    )
    op.create_index(
        "ix_titulo_pagar_status_vencimento", "titulo_pagar", ["status", "vencimento"], unique=False
    )

    op.create_table(
        "titulo_pagar_baixa",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("titulo_id", sa.BigInteger(), nullable=False),
        sa.Column("valor", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("forma_pagamento_id", sa.BigInteger(), nullable=False),
        sa.Column("data_pagamento", sa.Date(), nullable=False),
        sa.Column("estorno_de_id", sa.BigInteger(), nullable=True),
        sa.Column("chave_idempotencia", sa.String(length=64), nullable=True),
        sa.Column("observacao", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.CheckConstraint("valor <> 0", name=op.f("ck_titulo_pagar_baixa_valor_nao_zero")),
        sa.ForeignKeyConstraint(
            ["created_by"], ["usuario.id"], name=op.f("fk_titulo_pagar_baixa_created_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["estorno_de_id"],
            ["titulo_pagar_baixa.id"],
            name=op.f("fk_titulo_pagar_baixa_estorno_de_id_titulo_pagar_baixa"),
        ),
        sa.ForeignKeyConstraint(
            ["forma_pagamento_id"],
            ["forma_pagamento.id"],
            name=op.f("fk_titulo_pagar_baixa_forma_pagamento_id_forma_pagamento"),
        ),
        sa.ForeignKeyConstraint(
            ["titulo_id"],
            ["titulo_pagar.id"],
            name=op.f("fk_titulo_pagar_baixa_titulo_id_titulo_pagar"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_titulo_pagar_baixa")),
        sa.UniqueConstraint("estorno_de_id", name="uq_titulo_pagar_baixa_estorno_de"),
    )
    op.create_index(
        op.f("ix_titulo_pagar_baixa_titulo_id"), "titulo_pagar_baixa", ["titulo_id"], unique=False
    )
    op.create_index(
        "ix_titulo_pagar_baixa_data_pagamento",
        "titulo_pagar_baixa",
        ["data_pagamento"],
        unique=False,
    )
    op.create_index(
        "uq_titulo_pagar_baixa_chave",
        "titulo_pagar_baixa",
        ["titulo_id", "chave_idempotencia"],
        unique=True,
        postgresql_where=sa.text("chave_idempotencia IS NOT NULL"),
    )
    # Pagamento e estorno nunca mudam depois de gravados (correção = estorno).
    tornar_append_only(op, "titulo_pagar_baixa")

    # Fornecedor da compra. Adicionar coluna é DDL do owner: o trigger append-only só barra
    # UPDATE/DELETE de linhas. As entradas antigas ficam sem fornecedor (NULL).
    op.add_column("movimento_estoque", sa.Column("fornecedor_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        op.f("fk_movimento_estoque_fornecedor_id_pessoa"),
        "movimento_estoque",
        "pessoa",
        ["fornecedor_id"],
        ["id"],
    )
    op.create_index(
        op.f("ix_movimento_estoque_fornecedor_id"),
        "movimento_estoque",
        ["fornecedor_id"],
        unique=False,
    )

    # Categorias de despesa padrão. Não duplica uma que a empresa já tenha criado pela API
    # (o índice único por nome e tipo faria a migration falhar).
    valores = ", ".join(f"('{nome}')" for nome in CATEGORIAS_DESPESA)
    op.execute(
        f"""
        INSERT INTO categoria_financeira (nome, tipo)
        SELECT v.nome, 'despesa' FROM (VALUES {valores}) AS v(nome)
        WHERE NOT EXISTS (
            SELECT 1 FROM categoria_financeira c
            WHERE lower(c.nome) = lower(v.nome) AND c.tipo = 'despesa' AND c.deleted_at IS NULL
        )
        """
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_movimento_estoque_fornecedor_id"), table_name="movimento_estoque")
    op.drop_constraint(
        op.f("fk_movimento_estoque_fornecedor_id_pessoa"), "movimento_estoque", type_="foreignkey"
    )
    op.drop_column("movimento_estoque", "fornecedor_id")

    remover_append_only(op, "titulo_pagar_baixa")
    op.drop_index(
        "uq_titulo_pagar_baixa_chave",
        table_name="titulo_pagar_baixa",
        postgresql_where=sa.text("chave_idempotencia IS NOT NULL"),
    )
    op.drop_index("ix_titulo_pagar_baixa_data_pagamento", table_name="titulo_pagar_baixa")
    op.drop_index(op.f("ix_titulo_pagar_baixa_titulo_id"), table_name="titulo_pagar_baixa")
    op.drop_table("titulo_pagar_baixa")
    op.drop_index("ix_titulo_pagar_status_vencimento", table_name="titulo_pagar")
    op.drop_index(op.f("ix_titulo_pagar_categoria_id"), table_name="titulo_pagar")
    op.drop_index(op.f("ix_titulo_pagar_pessoa_id"), table_name="titulo_pagar")
    op.drop_table("titulo_pagar")

    # Remove as categorias padrão (as contas a pagar que as usavam já foram embora com a tabela);
    # nenhuma que ainda esteja em uso por conta a receber.
    nomes = ", ".join(f"'{nome}'" for nome in CATEGORIAS_DESPESA)
    op.execute(
        f"""
        DELETE FROM categoria_financeira
        WHERE tipo = 'despesa' AND nome IN ({nomes})
          AND id NOT IN (SELECT categoria_id FROM titulo_receber WHERE categoria_id IS NOT NULL)
        """
    )
