"""Utilitários para migrations Alembic (rodam como role owner)."""

import os
import re

_NOME_SQL = re.compile(r"^[a-z_][a-z0-9_]*$")

_FUNCAO_BLOQUEIO = """
CREATE OR REPLACE FUNCTION bloquear_alteracao() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'tabela % é append-only: % não permitido (use estorno/novo lançamento)',
        TG_TABLE_NAME, TG_OP USING ERRCODE = '42501';
END
$$
"""


def role_app() -> str:
    nome = os.environ.get("DB_APP_USER", "")
    if not _NOME_SQL.match(nome):
        raise SystemExit(
            "DB_APP_USER ausente ou inválida: migrations precisam do nome do role app."
        )
    return nome


def criar_funcao_append_only(op) -> None:  # noqa: ANN001
    op.execute(_FUNCAO_BLOQUEIO)


def remover_funcao_append_only(op) -> None:  # noqa: ANN001
    op.execute("DROP FUNCTION IF EXISTS bloquear_alteracao()")


def tornar_append_only(op, tabela: str) -> None:  # noqa: ANN001
    """Impede UPDATE/DELETE/TRUNCATE na tabela, em duas camadas independentes:
    privilégio (role app) e trigger. O trigger vale também para o owner em uso normal; o owner
    (só as migrations) ainda poderia desligá-lo com ALTER TABLE ... DISABLE TRIGGER, por isso a
    API nunca recebe a credencial do owner."""
    if not _NOME_SQL.match(tabela):
        raise ValueError(f"nome de tabela inválido: {tabela}")
    op.execute(f'REVOKE UPDATE, DELETE, TRUNCATE ON "{tabela}" FROM "{role_app()}"')
    op.execute(
        f'CREATE TRIGGER {tabela}_append_only BEFORE UPDATE OR DELETE ON "{tabela}" '
        "FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao()"
    )
    op.execute(
        f'CREATE TRIGGER {tabela}_append_only_truncate BEFORE TRUNCATE ON "{tabela}" '
        "FOR EACH STATEMENT EXECUTE FUNCTION bloquear_alteracao()"
    )


def remover_append_only(op, tabela: str) -> None:  # noqa: ANN001
    """Desfaz `tornar_append_only` (usado só em downgrade)."""
    if not _NOME_SQL.match(tabela):
        raise ValueError(f"nome de tabela inválido: {tabela}")
    op.execute(f'DROP TRIGGER IF EXISTS {tabela}_append_only_truncate ON "{tabela}"')
    op.execute(f'DROP TRIGGER IF EXISTS {tabela}_append_only ON "{tabela}"')
    op.execute(f'GRANT UPDATE, DELETE ON "{tabela}" TO "{role_app()}"')
