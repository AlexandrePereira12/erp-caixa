"""Pix copia e cola da empresa nas configurações

Revision ID: 0006
Revises: 0005
"""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Texto do Pix copia e cola estático (BR Code). Nulo = a empresa não cadastrou. A validação do
    # formato fica na aplicação (app.core.pix); o banco só limita o tamanho.
    op.add_column(
        "configuracao_empresa",
        sa.Column("pix_copia_e_cola", sa.String(length=1024), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("configuracao_empresa", "pix_copia_e_cola")
