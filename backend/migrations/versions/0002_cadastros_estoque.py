"""cadastros e estoque: pessoas, catálogo, saldos, movimentos (append-only) e inventário

Revision ID: 0002
Revises: 0001
"""

import sqlalchemy as sa
from alembic import op

from app.core.migration_helpers import tornar_append_only

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "categoria_produto",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("nome", sa.String(length=80), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("ativo", sa.Boolean(), server_default="true", nullable=False),
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
            ["created_by"], ["usuario.id"], name=op.f("fk_categoria_produto_created_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by"], ["usuario.id"], name=op.f("fk_categoria_produto_deleted_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["usuario.id"], name=op.f("fk_categoria_produto_updated_by_usuario")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_categoria_produto")),
    )
    op.create_index(
        "uq_categoria_produto_nome_ativa",
        "categoria_produto",
        [sa.literal_column("lower(nome)")],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_table(
        "inventario",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("descricao", sa.String(length=160), nullable=False),
        sa.Column("status", sa.String(length=12), server_default="aberto", nullable=False),
        sa.Column("fechado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fechado_por", sa.BigInteger(), nullable=True),
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
            "status IN ('aberto', 'fechado', 'cancelado')", name=op.f("ck_inventario_status")
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["usuario.id"], name=op.f("fk_inventario_created_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by"], ["usuario.id"], name=op.f("fk_inventario_deleted_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["fechado_por"], ["usuario.id"], name=op.f("fk_inventario_fechado_por_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["usuario.id"], name=op.f("fk_inventario_updated_by_usuario")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_inventario")),
    )
    op.create_table(
        "pessoa",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("tipo", sa.String(length=1), nullable=False),
        sa.Column("nome", sa.String(length=160), nullable=False),
        sa.Column("nome_fantasia", sa.String(length=160), nullable=True),
        sa.Column("documento", sa.String(length=14), nullable=True),
        sa.Column("telefone", sa.String(length=20), nullable=True),
        sa.Column("whatsapp", sa.String(length=20), nullable=True),
        sa.Column("email", sa.String(length=254), nullable=True),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("ativo", sa.Boolean(), server_default="true", nullable=False),
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
        sa.CheckConstraint("tipo IN ('F', 'J')", name=op.f("ck_pessoa_tipo")),
        sa.ForeignKeyConstraint(
            ["created_by"], ["usuario.id"], name=op.f("fk_pessoa_created_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by"], ["usuario.id"], name=op.f("fk_pessoa_deleted_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["usuario.id"], name=op.f("fk_pessoa_updated_by_usuario")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_pessoa")),
    )
    op.create_index(
        "uq_pessoa_documento_ativo",
        "pessoa",
        ["documento"],
        unique=True,
        postgresql_where=sa.text("documento IS NOT NULL AND deleted_at IS NULL"),
    )
    op.create_table(
        "unidade_medida",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("sigla", sa.String(length=10), nullable=False),
        sa.Column("nome", sa.String(length=60), nullable=False),
        sa.Column("casas_decimais", sa.SmallInteger(), server_default="0", nullable=False),
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
            ["created_by"], ["usuario.id"], name=op.f("fk_unidade_medida_created_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by"], ["usuario.id"], name=op.f("fk_unidade_medida_deleted_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["usuario.id"], name=op.f("fk_unidade_medida_updated_by_usuario")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_unidade_medida")),
    )
    op.create_index(
        "uq_unidade_medida_sigla_ativa",
        "unidade_medida",
        [sa.literal_column("lower(sigla)")],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_table(
        "pessoa_cliente",
        sa.Column("pessoa_id", sa.BigInteger(), nullable=False),
        sa.Column("aceita_fiado", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "limite_fiado", sa.Numeric(precision=14, scale=2), server_default="0", nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["pessoa_id"],
            ["pessoa.id"],
            name=op.f("fk_pessoa_cliente_pessoa_id_pessoa"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("pessoa_id", name=op.f("pk_pessoa_cliente")),
    )
    op.create_table(
        "pessoa_endereco",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("pessoa_id", sa.BigInteger(), nullable=False),
        sa.Column("rotulo", sa.String(length=30), nullable=True),
        sa.Column("cep", sa.String(length=8), nullable=True),
        sa.Column("logradouro", sa.String(length=160), nullable=False),
        sa.Column("numero", sa.String(length=20), nullable=True),
        sa.Column("complemento", sa.String(length=80), nullable=True),
        sa.Column("bairro", sa.String(length=80), nullable=True),
        sa.Column("cidade", sa.String(length=80), nullable=False),
        sa.Column("uf", sa.String(length=2), nullable=False),
        sa.Column("principal", sa.Boolean(), server_default="false", nullable=False),
        sa.ForeignKeyConstraint(
            ["pessoa_id"],
            ["pessoa.id"],
            name=op.f("fk_pessoa_endereco_pessoa_id_pessoa"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_pessoa_endereco")),
    )
    op.create_index(
        op.f("ix_pessoa_endereco_pessoa_id"), "pessoa_endereco", ["pessoa_id"], unique=False
    )
    op.create_table(
        "pessoa_papel",
        sa.Column("pessoa_id", sa.BigInteger(), nullable=False),
        sa.Column("papel", sa.String(length=20), nullable=False),
        sa.CheckConstraint(
            "papel IN ('cliente', 'fornecedor', 'colaborador')", name=op.f("ck_pessoa_papel_papel")
        ),
        sa.ForeignKeyConstraint(
            ["pessoa_id"],
            ["pessoa.id"],
            name=op.f("fk_pessoa_papel_pessoa_id_pessoa"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("pessoa_id", "papel", name=op.f("pk_pessoa_papel")),
    )
    op.create_table(
        "produto",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("nome", sa.String(length=160), nullable=False),
        sa.Column("tipo", sa.String(length=20), nullable=False),
        sa.Column("categoria_id", sa.BigInteger(), nullable=True),
        sa.Column("unidade_id", sa.BigInteger(), nullable=False),
        sa.Column("codigo", sa.String(length=40), nullable=True),
        sa.Column("codigo_barras", sa.String(length=32), nullable=True),
        sa.Column(
            "preco_venda", sa.Numeric(precision=14, scale=2), server_default="0", nullable=False
        ),
        sa.Column(
            "custo_medio", sa.Numeric(precision=14, scale=4), server_default="0", nullable=False
        ),
        sa.Column(
            "estoque_minimo", sa.Numeric(precision=14, scale=3), server_default="0", nullable=False
        ),
        sa.Column("controla_estoque", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("vendavel", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("ativo", sa.Boolean(), server_default="true", nullable=False),
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
            "tipo IN ('revenda', 'preparado', 'insumo', 'embalagem')", name=op.f("ck_produto_tipo")
        ),
        sa.CheckConstraint("estoque_minimo >= 0", name=op.f("ck_produto_minimo_nao_negativo")),
        sa.CheckConstraint("preco_venda >= 0", name=op.f("ck_produto_preco_nao_negativo")),
        sa.ForeignKeyConstraint(
            ["categoria_id"],
            ["categoria_produto.id"],
            name=op.f("fk_produto_categoria_id_categoria_produto"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["usuario.id"], name=op.f("fk_produto_created_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by"], ["usuario.id"], name=op.f("fk_produto_deleted_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["unidade_id"], ["unidade_medida.id"], name=op.f("fk_produto_unidade_id_unidade_medida")
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["usuario.id"], name=op.f("fk_produto_updated_by_usuario")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_produto")),
    )
    op.create_index(op.f("ix_produto_categoria_id"), "produto", ["categoria_id"], unique=False)
    op.create_index(
        "uq_produto_codigo_ativo",
        "produto",
        ["codigo"],
        unique=True,
        postgresql_where=sa.text("codigo IS NOT NULL AND deleted_at IS NULL"),
    )
    op.create_index(
        "uq_produto_codigo_barras_ativo",
        "produto",
        ["codigo_barras"],
        unique=True,
        postgresql_where=sa.text("codigo_barras IS NOT NULL AND deleted_at IS NULL"),
    )
    op.create_table(
        "estoque_saldo",
        sa.Column("produto_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "quantidade", sa.Numeric(precision=14, scale=3), server_default="0", nullable=False
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["produto_id"], ["produto.id"], name=op.f("fk_estoque_saldo_produto_id_produto")
        ),
        sa.PrimaryKeyConstraint("produto_id", name=op.f("pk_estoque_saldo")),
    )
    op.create_table(
        "inventario_item",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("inventario_id", sa.BigInteger(), nullable=False),
        sa.Column("produto_id", sa.BigInteger(), nullable=False),
        sa.Column("quantidade_sistema", sa.Numeric(precision=14, scale=3), nullable=False),
        sa.Column("quantidade_contada", sa.Numeric(precision=14, scale=3), nullable=True),
        sa.Column("diferenca", sa.Numeric(precision=14, scale=3), nullable=True),
        sa.ForeignKeyConstraint(
            ["inventario_id"],
            ["inventario.id"],
            name=op.f("fk_inventario_item_inventario_id_inventario"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["produto_id"], ["produto.id"], name=op.f("fk_inventario_item_produto_id_produto")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_inventario_item")),
        sa.UniqueConstraint("inventario_id", "produto_id", name="inventario_produto"),
    )
    op.create_index(
        op.f("ix_inventario_item_inventario_id"), "inventario_item", ["inventario_id"], unique=False
    )
    op.create_table(
        "movimento_estoque",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("produto_id", sa.BigInteger(), nullable=False),
        sa.Column("tipo", sa.String(length=20), nullable=False),
        sa.Column("quantidade", sa.Numeric(precision=14, scale=3), nullable=False),
        sa.Column("saldo_apos", sa.Numeric(precision=14, scale=3), nullable=False),
        sa.Column("custo_unitario", sa.Numeric(precision=14, scale=4), nullable=True),
        sa.Column("origem_tipo", sa.String(length=30), nullable=True),
        sa.Column("origem_id", sa.BigInteger(), nullable=True),
        sa.Column("documento", sa.String(length=60), nullable=True),
        sa.Column("justificativa", sa.Text(), nullable=True),
        sa.Column(
            "ocorrido_em",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.CheckConstraint(
            "tipo IN ('entrada', 'saida', 'perda', 'ajuste', 'inventario', 'venda', 'estorno_venda')",
            name=op.f("ck_movimento_estoque_tipo"),
        ),
        sa.CheckConstraint(
            "quantidade <> 0", name=op.f("ck_movimento_estoque_quantidade_nao_zero")
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["usuario.id"], name=op.f("fk_movimento_estoque_created_by_usuario")
        ),
        sa.ForeignKeyConstraint(
            ["produto_id"], ["produto.id"], name=op.f("fk_movimento_estoque_produto_id_produto")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_movimento_estoque")),
    )
    op.create_index(
        "ix_movimento_estoque_produto_data",
        "movimento_estoque",
        ["produto_id", "ocorrido_em"],
        unique=False,
    )
    op.create_index(
        "uq_movimento_estoque_origem",
        "movimento_estoque",
        ["origem_tipo", "origem_id", "produto_id"],
        unique=True,
        postgresql_where=sa.text("origem_id IS NOT NULL"),
    )
    op.create_table(
        "produto_composicao",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("produto_id", sa.BigInteger(), nullable=False),
        sa.Column("insumo_id", sa.BigInteger(), nullable=False),
        sa.Column("quantidade", sa.Numeric(precision=14, scale=3), nullable=False),
        sa.CheckConstraint(
            "produto_id <> insumo_id", name=op.f("ck_produto_composicao_sem_autoreferencia")
        ),
        sa.CheckConstraint(
            "quantidade > 0", name=op.f("ck_produto_composicao_quantidade_positiva")
        ),
        sa.ForeignKeyConstraint(
            ["insumo_id"], ["produto.id"], name=op.f("fk_produto_composicao_insumo_id_produto")
        ),
        sa.ForeignKeyConstraint(
            ["produto_id"],
            ["produto.id"],
            name=op.f("fk_produto_composicao_produto_id_produto"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_produto_composicao")),
        sa.UniqueConstraint("produto_id", "insumo_id", name="produto_insumo"),
    )
    op.create_index(
        op.f("ix_produto_composicao_insumo_id"), "produto_composicao", ["insumo_id"], unique=False
    )
    op.create_index(
        op.f("ix_produto_composicao_produto_id"), "produto_composicao", ["produto_id"], unique=False
    )

    # Movimentos de estoque nunca são alterados: correção é novo lançamento.
    tornar_append_only(op, "movimento_estoque")

    unidades = sa.table(
        "unidade_medida",
        sa.column("sigla", sa.String),
        sa.column("nome", sa.String),
        sa.column("casas_decimais", sa.SmallInteger),
    )
    op.bulk_insert(
        unidades,
        [
            {"sigla": "UN", "nome": "Unidade", "casas_decimais": 0},
            {"sigla": "KG", "nome": "Quilograma", "casas_decimais": 3},
            {"sigla": "G", "nome": "Grama", "casas_decimais": 0},
            {"sigla": "L", "nome": "Litro", "casas_decimais": 3},
            {"sigla": "ML", "nome": "Mililitro", "casas_decimais": 0},
            {"sigla": "CX", "nome": "Caixa", "casas_decimais": 0},
            {"sigla": "PCT", "nome": "Pacote", "casas_decimais": 0},
        ],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_produto_composicao_produto_id"), table_name="produto_composicao")
    op.drop_index(op.f("ix_produto_composicao_insumo_id"), table_name="produto_composicao")
    op.drop_table("produto_composicao")
    op.drop_index(
        "uq_movimento_estoque_origem",
        table_name="movimento_estoque",
        postgresql_where=sa.text("origem_id IS NOT NULL"),
    )
    op.drop_index("ix_movimento_estoque_produto_data", table_name="movimento_estoque")
    op.drop_table("movimento_estoque")
    op.drop_index(op.f("ix_inventario_item_inventario_id"), table_name="inventario_item")
    op.drop_table("inventario_item")
    op.drop_table("estoque_saldo")
    op.drop_index(
        "uq_produto_codigo_barras_ativo",
        table_name="produto",
        postgresql_where=sa.text("codigo_barras IS NOT NULL AND deleted_at IS NULL"),
    )
    op.drop_index(
        "uq_produto_codigo_ativo",
        table_name="produto",
        postgresql_where=sa.text("codigo IS NOT NULL AND deleted_at IS NULL"),
    )
    op.drop_index(op.f("ix_produto_categoria_id"), table_name="produto")
    op.drop_table("produto")
    op.drop_table("pessoa_papel")
    op.drop_index(op.f("ix_pessoa_endereco_pessoa_id"), table_name="pessoa_endereco")
    op.drop_table("pessoa_endereco")
    op.drop_table("pessoa_cliente")
    op.drop_index(
        "uq_unidade_medida_sigla_ativa",
        table_name="unidade_medida",
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.drop_table("unidade_medida")
    op.drop_index(
        "uq_pessoa_documento_ativo",
        table_name="pessoa",
        postgresql_where=sa.text("documento IS NOT NULL AND deleted_at IS NULL"),
    )
    op.drop_table("pessoa")
    op.drop_table("inventario")
    op.drop_index(
        "uq_categoria_produto_nome_ativa",
        table_name="categoria_produto",
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.drop_table("categoria_produto")
