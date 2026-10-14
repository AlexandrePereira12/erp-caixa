"""endurecimento após revisão: bloqueio de login, invalidação de tokens, baixa idempotente,
histórico de vendas imutável e índices de consulta

Revision ID: 0004
Revises: 0003
"""

import sqlalchemy as sa
from alembic import op

from app.core.migration_helpers import remover_append_only, tornar_append_only

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

# Histórico que nunca muda depois de gravado (correção = estorno).
IMUTAVEIS = ("venda", "venda_item", "venda_pagamento", "venda_estorno", "caixa_conferencia")

RENOMEAR = (
    ("titulo_receber_baixa", "estorno_de", "uq_titulo_receber_baixa_estorno_de"),
    ("caixa_conferencia", "caixa_rodada_forma", "uq_caixa_conferencia_rodada_forma"),
    ("produto_composicao", "produto_insumo", "uq_produto_composicao_insumo"),
    ("inventario_item", "inventario_produto", "uq_inventario_item_produto"),
)


def upgrade() -> None:
    op.add_column(
        "usuario",
        sa.Column("falhas_login", sa.SmallInteger(), server_default="0", nullable=False),
    )
    op.add_column("usuario", sa.Column("bloqueado_ate", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "usuario", sa.Column("tokens_invalidos_ate", sa.DateTime(timezone=True), nullable=True)
    )

    op.add_column(
        "titulo_receber_baixa", sa.Column("chave_idempotencia", sa.String(length=64), nullable=True)
    )
    op.create_index(
        "uq_titulo_baixa_chave",
        "titulo_receber_baixa",
        ["titulo_id", "chave_idempotencia"],
        unique=True,
        postgresql_where=sa.text("chave_idempotencia IS NOT NULL"),
    )

    op.create_index("ix_movimento_caixa_forma", "movimento_caixa", ["forma_pagamento_id"])
    op.create_index("ix_movimento_estoque_ocorrido", "movimento_estoque", ["ocorrido_em", "id"])
    op.create_index("ix_movimento_estoque_tipo_data", "movimento_estoque", ["tipo", "ocorrido_em"])
    op.create_index("ix_comanda_cliente", "comanda", ["cliente_id"])
    op.create_index("ix_comanda_created_at", "comanda", ["created_at"])
    op.create_index("ix_titulo_receber_status", "titulo_receber", ["status"])

    for tabela, antigo, novo in RENOMEAR:
        op.execute(f'ALTER TABLE "{tabela}" RENAME CONSTRAINT "{antigo}" TO "{novo}"')

    # Apagar uma venda não pode levar itens e pagamentos junto (e não há DELETE de venda mesmo).
    for tabela in ("venda_item", "venda_pagamento"):
        nome = f"fk_{tabela}_venda_id_venda"
        op.drop_constraint(nome, tabela, type_="foreignkey")
        op.create_foreign_key(nome, tabela, "venda", ["venda_id"], ["id"])

    for tabela in IMUTAVEIS:
        tornar_append_only(op, tabela)


def downgrade() -> None:
    for tabela in IMUTAVEIS:
        remover_append_only(op, tabela)

    for tabela in ("venda_item", "venda_pagamento"):
        nome = f"fk_{tabela}_venda_id_venda"
        op.drop_constraint(nome, tabela, type_="foreignkey")
        op.create_foreign_key(nome, tabela, "venda", ["venda_id"], ["id"], ondelete="CASCADE")

    for tabela, antigo, novo in RENOMEAR:
        op.execute(f'ALTER TABLE "{tabela}" RENAME CONSTRAINT "{novo}" TO "{antigo}"')

    op.drop_index("ix_titulo_receber_status", table_name="titulo_receber")
    op.drop_index("ix_comanda_created_at", table_name="comanda")
    op.drop_index("ix_comanda_cliente", table_name="comanda")
    op.drop_index("ix_movimento_estoque_tipo_data", table_name="movimento_estoque")
    op.drop_index("ix_movimento_estoque_ocorrido", table_name="movimento_estoque")
    op.drop_index("ix_movimento_caixa_forma", table_name="movimento_caixa")
    op.drop_index("uq_titulo_baixa_chave", table_name="titulo_receber_baixa")
    op.drop_column("titulo_receber_baixa", "chave_idempotencia")
    op.drop_column("usuario", "tokens_invalidos_ate")
    op.drop_column("usuario", "bloqueado_ate")
    op.drop_column("usuario", "falhas_login")
