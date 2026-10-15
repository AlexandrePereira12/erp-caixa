"""dados da empresa nas configurações (CNPJ, telefone, endereço, e-mail de contato)

Revision ID: 0007
Revises: 0006
"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

COLUNAS = (
    ("cnpj", 14),
    ("telefone", 11),
    ("endereco", 240),
    ("email_contato", 120),
)


def upgrade() -> None:
    # Todas anuláveis: a empresa preenche o que quiser. A validação do formato fica na aplicação.
    for nome, tamanho in COLUNAS:
        op.add_column(
            "configuracao_empresa", sa.Column(nome, sa.String(length=tamanho), nullable=True)
        )


def downgrade() -> None:
    for nome, _ in reversed(COLUNAS):
        op.drop_column("configuracao_empresa", nome)
