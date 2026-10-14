"""operação do PDV: mesas, comandas, caixa, vendas e contas a receber

Revision ID: 0003
Revises: 0002
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.core.migration_helpers import tornar_append_only

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "caixa",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("operador_id", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.String(length=10), server_default="aberto", nullable=False),
        sa.Column("valor_abertura", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column(
            "aberto_em", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("fechado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fechado_por", sa.BigInteger(), nullable=True),
        sa.Column("rodada", sa.SmallInteger(), server_default="1", nullable=False),
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
        sa.CheckConstraint("status IN ('aberto', 'fechado')", name=op.f("ck_caixa_status")),
        sa.CheckConstraint("valor_abertura >= 0", name=op.f("ck_caixa_abertura_nao_negativa")),
        sa.ForeignKeyConstraint(
            ["created_by"], ["usuario.id"], name=op.f("fk_caixa_created_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by"], ["usuario.id"], name=op.f("fk_caixa_deleted_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["fechado_por"], ["usuario.id"], name=op.f("fk_caixa_fechado_por_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["operador_id"], ["usuario.id"], name=op.f("fk_caixa_operador_id_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["usuario.id"], name=op.f("fk_caixa_updated_by_usuario")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_caixa")),
    )
    op.create_index(op.f("ix_caixa_operador_id"), "caixa", ["operador_id"], unique=False)
    op.create_index(
        "uq_caixa_operador_aberto",
        "caixa",
        ["operador_id"],
        unique=True,
        postgresql_where=sa.text("status = 'aberto'"),
    )
    op.create_table(
        "categoria_financeira",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("nome", sa.String(length=80), nullable=False),
        sa.Column("tipo", sa.String(length=10), nullable=False),
        sa.Column("ativa", sa.Boolean(), server_default="true", nullable=False),
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
            "tipo IN ('receita', 'despesa')", name=op.f("ck_categoria_financeira_tipo")
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["usuario.id"], name=op.f("fk_categoria_financeira_created_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by"], ["usuario.id"], name=op.f("fk_categoria_financeira_deleted_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["usuario.id"], name=op.f("fk_categoria_financeira_updated_by_usuario")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_categoria_financeira")),
    )
    op.create_index(
        "uq_categoria_financeira_nome_tipo_ativa",
        "categoria_financeira",
        [sa.literal_column("lower(nome)"), "tipo"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_table(
        "forma_pagamento",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("nome", sa.String(length=60), nullable=False),
        sa.Column("tipo", sa.String(length=10), nullable=False),
        sa.Column("ativa", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("ordem", sa.SmallInteger(), server_default="0", nullable=False),
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
            "tipo IN ('dinheiro', 'pix', 'debito', 'credito', 'vale', 'fiado', 'outro')",
            name=op.f("ck_forma_pagamento_tipo"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["usuario.id"], name=op.f("fk_forma_pagamento_created_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by"], ["usuario.id"], name=op.f("fk_forma_pagamento_deleted_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["usuario.id"], name=op.f("fk_forma_pagamento_updated_by_usuario")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_forma_pagamento")),
    )
    op.create_index(
        "uq_forma_pagamento_tipo_unico",
        "forma_pagamento",
        ["tipo"],
        unique=True,
        postgresql_where=sa.text("tipo IN ('dinheiro', 'fiado') AND deleted_at IS NULL"),
    )
    op.create_index(
        "uq_forma_pagamento_nome_ativa",
        "forma_pagamento",
        [sa.literal_column("lower(nome)")],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_table(
        "mesa",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("nome", sa.String(length=40), nullable=False),
        sa.Column("capacidade", sa.SmallInteger(), nullable=True),
        sa.Column("status", sa.String(length=25), server_default="livre", nullable=False),
        sa.Column("ativa", sa.Boolean(), server_default="true", nullable=False),
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
            "status IN ('livre', 'ocupada', 'aguardando_pagamento', 'reservada', 'bloqueada')",
            name=op.f("ck_mesa_status"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["usuario.id"], name=op.f("fk_mesa_created_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by"], ["usuario.id"], name=op.f("fk_mesa_deleted_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["usuario.id"], name=op.f("fk_mesa_updated_by_usuario")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_mesa")),
    )
    op.create_index(
        "uq_mesa_nome_ativa",
        "mesa",
        [sa.literal_column("lower(nome)")],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_table(
        "caixa_conferencia",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("caixa_id", sa.BigInteger(), nullable=False),
        sa.Column("rodada", sa.SmallInteger(), nullable=False),
        sa.Column("forma_pagamento_id", sa.BigInteger(), nullable=False),
        sa.Column("valor_esperado", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("valor_contado", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("diferenca", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("justificativa", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.ForeignKeyConstraint(
            ["caixa_id"], ["caixa.id"], name=op.f("fk_caixa_conferencia_caixa_id_caixa")
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["usuario.id"], name=op.f("fk_caixa_conferencia_created_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["forma_pagamento_id"],
            ["forma_pagamento.id"],
            name=op.f("fk_caixa_conferencia_forma_pagamento_id_forma_pagamento"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_caixa_conferencia")),
        sa.UniqueConstraint("caixa_id", "rodada", "forma_pagamento_id", name="caixa_rodada_forma"),
    )
    op.create_index(
        op.f("ix_caixa_conferencia_caixa_id"), "caixa_conferencia", ["caixa_id"], unique=False
    )
    op.create_table(
        "caixa_evento",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("caixa_id", sa.BigInteger(), nullable=False),
        sa.Column("tipo", sa.String(length=12), nullable=False),
        sa.Column("justificativa", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.CheckConstraint(
            "tipo IN ('abertura', 'fechamento', 'reabertura')", name=op.f("ck_caixa_evento_tipo")
        ),
        sa.ForeignKeyConstraint(
            ["caixa_id"], ["caixa.id"], name=op.f("fk_caixa_evento_caixa_id_caixa")
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["usuario.id"], name=op.f("fk_caixa_evento_created_by_usuario")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_caixa_evento")),
    )
    op.create_index(op.f("ix_caixa_evento_caixa_id"), "caixa_evento", ["caixa_id"], unique=False)
    op.create_table(
        "comanda",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("tipo", sa.String(length=10), nullable=False),
        sa.Column("mesa_id", sa.BigInteger(), nullable=True),
        sa.Column("cliente_id", sa.BigInteger(), nullable=True),
        sa.Column("nome_cliente", sa.String(length=120), nullable=True),
        sa.Column("endereco_entrega", sa.Text(), nullable=True),
        sa.Column("num_pessoas", sa.SmallInteger(), nullable=True),
        sa.Column("observacao", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=25), server_default="aberta", nullable=False),
        sa.Column(
            "taxa_servico_pct", sa.Numeric(precision=5, scale=2), server_default="0", nullable=False
        ),
        sa.Column("fechada_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelada_motivo", sa.Text(), nullable=True),
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
            "status IN ('aberta', 'aguardando_pagamento', 'fechada', 'cancelada')",
            name=op.f("ck_comanda_status"),
        ),
        sa.CheckConstraint(
            "tipo <> 'mesa' OR mesa_id IS NOT NULL", name=op.f("ck_comanda_mesa_obrigatoria")
        ),
        sa.CheckConstraint(
            "tipo IN ('mesa', 'balcao', 'retirada', 'delivery')", name=op.f("ck_comanda_tipo")
        ),
        sa.ForeignKeyConstraint(
            ["cliente_id"], ["pessoa.id"], name=op.f("fk_comanda_cliente_id_pessoa")
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["usuario.id"], name=op.f("fk_comanda_created_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by"], ["usuario.id"], name=op.f("fk_comanda_deleted_by_usuario")
        ),
        sa.ForeignKeyConstraint(["mesa_id"], ["mesa.id"], name=op.f("fk_comanda_mesa_id_mesa")),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["usuario.id"], name=op.f("fk_comanda_updated_by_usuario")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_comanda")),
    )
    op.create_index("ix_comanda_status", "comanda", ["status"], unique=False)
    op.create_index(
        "uq_comanda_mesa_em_andamento",
        "comanda",
        ["mesa_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('aberta', 'aguardando_pagamento')"),
    )
    op.create_table(
        "movimento_caixa",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("caixa_id", sa.BigInteger(), nullable=False),
        sa.Column("tipo", sa.String(length=25), nullable=False),
        sa.Column("forma_pagamento_id", sa.BigInteger(), nullable=False),
        sa.Column("valor", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("origem_tipo", sa.String(length=30), nullable=True),
        sa.Column("origem_id", sa.BigInteger(), nullable=True),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.CheckConstraint(
            "tipo IN ('abertura', 'venda', 'recebimento', 'sangria', 'reforco', 'estorno_venda', 'estorno_recebimento')",
            name=op.f("ck_movimento_caixa_tipo"),
        ),
        sa.CheckConstraint("valor <> 0", name=op.f("ck_movimento_caixa_valor_nao_zero")),
        sa.ForeignKeyConstraint(
            ["caixa_id"], ["caixa.id"], name=op.f("fk_movimento_caixa_caixa_id_caixa")
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["usuario.id"], name=op.f("fk_movimento_caixa_created_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["forma_pagamento_id"],
            ["forma_pagamento.id"],
            name=op.f("fk_movimento_caixa_forma_pagamento_id_forma_pagamento"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_movimento_caixa")),
    )
    op.create_index(
        op.f("ix_movimento_caixa_caixa_id"), "movimento_caixa", ["caixa_id"], unique=False
    )
    op.create_index(
        "uq_movimento_caixa_origem",
        "movimento_caixa",
        ["origem_tipo", "origem_id"],
        unique=True,
        postgresql_where=sa.text("origem_id IS NOT NULL"),
    )
    op.create_table(
        "comanda_ajuste",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("comanda_id", sa.BigInteger(), nullable=False),
        sa.Column("tipo", sa.String(length=10), nullable=False),
        sa.Column("modo", sa.String(length=10), nullable=False),
        sa.Column("valor", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("justificativa", sa.Text(), nullable=False),
        sa.Column("removido_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("removido_por", sa.BigInteger(), nullable=True),
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
            "modo <> 'percentual' OR valor <= 100",
            name=op.f("ck_comanda_ajuste_percentual_ate_100"),
        ),
        sa.CheckConstraint("modo IN ('valor', 'percentual')", name=op.f("ck_comanda_ajuste_modo")),
        sa.CheckConstraint(
            "tipo IN ('desconto', 'acrescimo')", name=op.f("ck_comanda_ajuste_tipo")
        ),
        sa.CheckConstraint("valor > 0", name=op.f("ck_comanda_ajuste_valor_positivo")),
        sa.ForeignKeyConstraint(
            ["comanda_id"],
            ["comanda.id"],
            name=op.f("fk_comanda_ajuste_comanda_id_comanda"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["usuario.id"], name=op.f("fk_comanda_ajuste_created_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by"], ["usuario.id"], name=op.f("fk_comanda_ajuste_deleted_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["removido_por"], ["usuario.id"], name=op.f("fk_comanda_ajuste_removido_por_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["usuario.id"], name=op.f("fk_comanda_ajuste_updated_by_usuario")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_comanda_ajuste")),
    )
    op.create_index(
        op.f("ix_comanda_ajuste_comanda_id"), "comanda_ajuste", ["comanda_id"], unique=False
    )
    op.create_table(
        "comanda_evento",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("comanda_id", sa.BigInteger(), nullable=False),
        sa.Column("tipo", sa.String(length=30), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=False),
        sa.Column("dados", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.ForeignKeyConstraint(
            ["comanda_id"], ["comanda.id"], name=op.f("fk_comanda_evento_comanda_id_comanda")
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["usuario.id"], name=op.f("fk_comanda_evento_created_by_usuario")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_comanda_evento")),
    )
    op.create_index(
        op.f("ix_comanda_evento_comanda_id"), "comanda_evento", ["comanda_id"], unique=False
    )
    op.create_table(
        "comanda_item",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("comanda_id", sa.BigInteger(), nullable=False),
        sa.Column("produto_id", sa.BigInteger(), nullable=False),
        sa.Column("descricao", sa.String(length=160), nullable=False),
        sa.Column("quantidade", sa.Numeric(precision=14, scale=3), nullable=False),
        sa.Column("preco_unitario", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("observacao", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=10), server_default="ativo", nullable=False),
        sa.Column("cancelado_motivo", sa.Text(), nullable=True),
        sa.Column("cancelado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelado_por", sa.BigInteger(), nullable=True),
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
        sa.CheckConstraint("status IN ('ativo', 'cancelado')", name=op.f("ck_comanda_item_status")),
        sa.CheckConstraint("preco_unitario >= 0", name=op.f("ck_comanda_item_preco_nao_negativo")),
        sa.CheckConstraint("quantidade > 0", name=op.f("ck_comanda_item_quantidade_positiva")),
        sa.ForeignKeyConstraint(
            ["cancelado_por"], ["usuario.id"], name=op.f("fk_comanda_item_cancelado_por_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["comanda_id"],
            ["comanda.id"],
            name=op.f("fk_comanda_item_comanda_id_comanda"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["usuario.id"], name=op.f("fk_comanda_item_created_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by"], ["usuario.id"], name=op.f("fk_comanda_item_deleted_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["produto_id"], ["produto.id"], name=op.f("fk_comanda_item_produto_id_produto")
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["usuario.id"], name=op.f("fk_comanda_item_updated_by_usuario")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_comanda_item")),
    )
    op.create_index(
        op.f("ix_comanda_item_comanda_id"), "comanda_item", ["comanda_id"], unique=False
    )
    op.create_table(
        "venda",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("comanda_id", sa.BigInteger(), nullable=False),
        sa.Column("caixa_id", sa.BigInteger(), nullable=False),
        sa.Column("cliente_id", sa.BigInteger(), nullable=True),
        sa.Column("subtotal", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("desconto_total", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("acrescimo_total", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("taxa_servico", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("total", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.CheckConstraint("total >= 0", name=op.f("ck_venda_total_nao_negativo")),
        sa.ForeignKeyConstraint(["caixa_id"], ["caixa.id"], name=op.f("fk_venda_caixa_id_caixa")),
        sa.ForeignKeyConstraint(
            ["cliente_id"], ["pessoa.id"], name=op.f("fk_venda_cliente_id_pessoa")
        ),
        sa.ForeignKeyConstraint(
            ["comanda_id"], ["comanda.id"], name=op.f("fk_venda_comanda_id_comanda")
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["usuario.id"], name=op.f("fk_venda_created_by_usuario")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_venda")),
        sa.UniqueConstraint("comanda_id", name="uq_venda_comanda"),
    )
    op.create_index(op.f("ix_venda_caixa_id"), "venda", ["caixa_id"], unique=False)
    op.create_index(op.f("ix_venda_cliente_id"), "venda", ["cliente_id"], unique=False)
    op.create_index(op.f("ix_venda_created_at"), "venda", ["created_at"], unique=False)
    op.create_table(
        "venda_estorno",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("venda_id", sa.BigInteger(), nullable=False),
        sa.Column("motivo", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.ForeignKeyConstraint(
            ["created_by"], ["usuario.id"], name=op.f("fk_venda_estorno_created_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["venda_id"], ["venda.id"], name=op.f("fk_venda_estorno_venda_id_venda")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_venda_estorno")),
        sa.UniqueConstraint("venda_id", name="uq_venda_estorno_venda"),
    )
    op.create_table(
        "venda_item",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("venda_id", sa.BigInteger(), nullable=False),
        sa.Column("comanda_item_id", sa.BigInteger(), nullable=False),
        sa.Column("produto_id", sa.BigInteger(), nullable=False),
        sa.Column("descricao", sa.String(length=160), nullable=False),
        sa.Column("quantidade", sa.Numeric(precision=14, scale=3), nullable=False),
        sa.Column("preco_unitario", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("total", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.ForeignKeyConstraint(
            ["comanda_item_id"],
            ["comanda_item.id"],
            name=op.f("fk_venda_item_comanda_item_id_comanda_item"),
        ),
        sa.ForeignKeyConstraint(
            ["produto_id"], ["produto.id"], name=op.f("fk_venda_item_produto_id_produto")
        ),
        sa.ForeignKeyConstraint(
            ["venda_id"],
            ["venda.id"],
            name=op.f("fk_venda_item_venda_id_venda"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_venda_item")),
        sa.UniqueConstraint("comanda_item_id", name="uq_venda_item_comanda_item"),
    )
    op.create_index(op.f("ix_venda_item_produto_id"), "venda_item", ["produto_id"], unique=False)
    op.create_index(op.f("ix_venda_item_venda_id"), "venda_item", ["venda_id"], unique=False)
    op.create_table(
        "venda_pagamento",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("venda_id", sa.BigInteger(), nullable=False),
        sa.Column("forma_pagamento_id", sa.BigInteger(), nullable=False),
        sa.Column("valor", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("valor_recebido", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("troco", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("parcelas", sa.SmallInteger(), nullable=True),
        sa.Column("observacao", sa.Text(), nullable=True),
        sa.CheckConstraint("valor > 0", name=op.f("ck_venda_pagamento_valor_positivo")),
        sa.ForeignKeyConstraint(
            ["forma_pagamento_id"],
            ["forma_pagamento.id"],
            name=op.f("fk_venda_pagamento_forma_pagamento_id_forma_pagamento"),
        ),
        sa.ForeignKeyConstraint(
            ["venda_id"],
            ["venda.id"],
            name=op.f("fk_venda_pagamento_venda_id_venda"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_venda_pagamento")),
    )
    op.create_index(
        op.f("ix_venda_pagamento_venda_id"), "venda_pagamento", ["venda_id"], unique=False
    )
    op.create_table(
        "titulo_receber",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("pessoa_id", sa.BigInteger(), nullable=False),
        sa.Column("venda_pagamento_id", sa.BigInteger(), nullable=True),
        sa.Column("categoria_id", sa.BigInteger(), nullable=True),
        sa.Column("descricao", sa.String(length=200), nullable=False),
        sa.Column("valor_original", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column(
            "valor_pago", sa.Numeric(precision=14, scale=2), server_default="0", nullable=False
        ),
        sa.Column("vencimento", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=10), server_default="aberto", nullable=False),
        sa.Column("cancelado_motivo", sa.Text(), nullable=True),
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
            "status IN ('aberto', 'pago', 'cancelado')", name=op.f("ck_titulo_receber_status")
        ),
        sa.CheckConstraint("valor_original > 0", name=op.f("ck_titulo_receber_valor_positivo")),
        sa.CheckConstraint(
            "valor_pago >= 0 AND valor_pago <= valor_original",
            name=op.f("ck_titulo_receber_pago_dentro_do_valor"),
        ),
        sa.ForeignKeyConstraint(
            ["categoria_id"],
            ["categoria_financeira.id"],
            name=op.f("fk_titulo_receber_categoria_id_categoria_financeira"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["usuario.id"], name=op.f("fk_titulo_receber_created_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by"], ["usuario.id"], name=op.f("fk_titulo_receber_deleted_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["pessoa_id"], ["pessoa.id"], name=op.f("fk_titulo_receber_pessoa_id_pessoa")
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["usuario.id"], name=op.f("fk_titulo_receber_updated_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["venda_pagamento_id"],
            ["venda_pagamento.id"],
            name=op.f("fk_titulo_receber_venda_pagamento_id_venda_pagamento"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_titulo_receber")),
        sa.UniqueConstraint("venda_pagamento_id", name="uq_titulo_receber_venda_pagamento"),
    )
    op.create_index(
        op.f("ix_titulo_receber_pessoa_id"), "titulo_receber", ["pessoa_id"], unique=False
    )
    op.create_table(
        "titulo_receber_baixa",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("titulo_id", sa.BigInteger(), nullable=False),
        sa.Column("valor", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("forma_pagamento_id", sa.BigInteger(), nullable=False),
        sa.Column("caixa_id", sa.BigInteger(), nullable=False),
        sa.Column("estorno_de_id", sa.BigInteger(), nullable=True),
        sa.Column("observacao", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.CheckConstraint("valor <> 0", name=op.f("ck_titulo_receber_baixa_valor_nao_zero")),
        sa.ForeignKeyConstraint(
            ["caixa_id"], ["caixa.id"], name=op.f("fk_titulo_receber_baixa_caixa_id_caixa")
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["usuario.id"], name=op.f("fk_titulo_receber_baixa_created_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["estorno_de_id"],
            ["titulo_receber_baixa.id"],
            name=op.f("fk_titulo_receber_baixa_estorno_de_id_titulo_receber_baixa"),
        ),
        sa.ForeignKeyConstraint(
            ["forma_pagamento_id"],
            ["forma_pagamento.id"],
            name=op.f("fk_titulo_receber_baixa_forma_pagamento_id_forma_pagamento"),
        ),
        sa.ForeignKeyConstraint(
            ["titulo_id"],
            ["titulo_receber.id"],
            name=op.f("fk_titulo_receber_baixa_titulo_id_titulo_receber"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_titulo_receber_baixa")),
        sa.UniqueConstraint("estorno_de_id", name="estorno_de"),
    )
    op.create_index(
        op.f("ix_titulo_receber_baixa_titulo_id"),
        "titulo_receber_baixa",
        ["titulo_id"],
        unique=False,
    )
    op.add_column(
        "configuracao_empresa",
        sa.Column(
            "taxa_servico_pct", sa.Numeric(precision=5, scale=2), server_default="0", nullable=False
        ),
    )
    op.add_column(
        "configuracao_empresa",
        sa.Column("cancelamento_janela_min", sa.SmallInteger(), server_default="5", nullable=False),
    )
    op.add_column(
        "papel",
        sa.Column(
            "limite_desconto_pct",
            sa.Numeric(precision=5, scale=2),
            server_default="0",
            nullable=False,
        ),
    )

    # Trilhas que nunca são alteradas: correção é novo lançamento (estorno).
    for tabela in ("comanda_evento", "caixa_evento", "movimento_caixa", "titulo_receber_baixa"):
        tornar_append_only(op, tabela)

    # Limite de desconto por papel de sistema (% do subtotal da comanda).
    op.execute("""
        UPDATE papel SET limite_desconto_pct = CASE nome
            WHEN 'Administrador' THEN 100
            WHEN 'Gerente' THEN 20
            WHEN 'Frente de loja' THEN 5
            ELSE 0 END
        WHERE sistema
    """)

    formas = sa.table(
        "forma_pagamento",
        sa.column("nome", sa.String),
        sa.column("tipo", sa.String),
        sa.column("ordem", sa.SmallInteger),
    )
    op.bulk_insert(
        formas,
        [
            {"nome": "Dinheiro", "tipo": "dinheiro", "ordem": 1},
            {"nome": "PIX", "tipo": "pix", "ordem": 2},
            {"nome": "Cartão de débito", "tipo": "debito", "ordem": 3},
            {"nome": "Cartão de crédito", "tipo": "credito", "ordem": 4},
            {"nome": "Vale-refeição", "tipo": "vale", "ordem": 5},
            {"nome": "Fiado", "tipo": "fiado", "ordem": 6},
        ],
    )
    categorias = sa.table(
        "categoria_financeira", sa.column("nome", sa.String), sa.column("tipo", sa.String)
    )
    op.bulk_insert(categorias, [{"nome": "Vendas fiado", "tipo": "receita"}])


def downgrade() -> None:
    op.drop_column("papel", "limite_desconto_pct")
    op.drop_column("configuracao_empresa", "cancelamento_janela_min")
    op.drop_column("configuracao_empresa", "taxa_servico_pct")
    op.drop_index(op.f("ix_titulo_receber_baixa_titulo_id"), table_name="titulo_receber_baixa")
    op.drop_table("titulo_receber_baixa")
    op.drop_index(op.f("ix_titulo_receber_pessoa_id"), table_name="titulo_receber")
    op.drop_table("titulo_receber")
    op.drop_index(op.f("ix_venda_pagamento_venda_id"), table_name="venda_pagamento")
    op.drop_table("venda_pagamento")
    op.drop_index(op.f("ix_venda_item_venda_id"), table_name="venda_item")
    op.drop_index(op.f("ix_venda_item_produto_id"), table_name="venda_item")
    op.drop_table("venda_item")
    op.drop_table("venda_estorno")
    op.drop_index(op.f("ix_venda_created_at"), table_name="venda")
    op.drop_index(op.f("ix_venda_cliente_id"), table_name="venda")
    op.drop_index(op.f("ix_venda_caixa_id"), table_name="venda")
    op.drop_table("venda")
    op.drop_index(op.f("ix_comanda_item_comanda_id"), table_name="comanda_item")
    op.drop_table("comanda_item")
    op.drop_index(op.f("ix_comanda_evento_comanda_id"), table_name="comanda_evento")
    op.drop_table("comanda_evento")
    op.drop_index(op.f("ix_comanda_ajuste_comanda_id"), table_name="comanda_ajuste")
    op.drop_table("comanda_ajuste")
    op.drop_index(
        "uq_movimento_caixa_origem",
        table_name="movimento_caixa",
        postgresql_where=sa.text("origem_id IS NOT NULL"),
    )
    op.drop_index(op.f("ix_movimento_caixa_caixa_id"), table_name="movimento_caixa")
    op.drop_table("movimento_caixa")
    op.drop_index(
        "uq_comanda_mesa_em_andamento",
        table_name="comanda",
        postgresql_where=sa.text("status IN ('aberta', 'aguardando_pagamento')"),
    )
    op.drop_index("ix_comanda_status", table_name="comanda")
    op.drop_table("comanda")
    op.drop_index(op.f("ix_caixa_evento_caixa_id"), table_name="caixa_evento")
    op.drop_table("caixa_evento")
    op.drop_index(op.f("ix_caixa_conferencia_caixa_id"), table_name="caixa_conferencia")
    op.drop_table("caixa_conferencia")
    op.drop_index(
        "uq_mesa_nome_ativa", table_name="mesa", postgresql_where=sa.text("deleted_at IS NULL")
    )
    op.drop_table("mesa")
    op.drop_index(
        "uq_forma_pagamento_nome_ativa",
        table_name="forma_pagamento",
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.drop_table("forma_pagamento")
    op.drop_index(
        "uq_categoria_financeira_nome_tipo_ativa",
        table_name="categoria_financeira",
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.drop_table("categoria_financeira")
    op.drop_index(
        "uq_caixa_operador_aberto",
        table_name="caixa",
        postgresql_where=sa.text("status = 'aberto'"),
    )
    op.drop_index(op.f("ix_caixa_operador_id"), table_name="caixa")
    op.drop_table("caixa")
