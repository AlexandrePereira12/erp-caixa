import psycopg
import pytest

from conftest import APP, OWNER


def test_role_app_insere_mas_nao_altera_a_auditoria(ambiente):
    with ambiente.conexao(APP) as c:
        c.execute(
            "INSERT INTO auditoria_log (acao, modulo, recurso, descricao) VALUES ('X','m','r','d')"
        )
        for comando in (
            "UPDATE auditoria_log SET descricao = 'alterada'",
            "DELETE FROM auditoria_log",
            "TRUNCATE auditoria_log",
        ):
            with pytest.raises(psycopg.errors.InsufficientPrivilege, match="permission denied"):
                c.execute(comando)


def test_trigger_bloqueia_ate_o_owner(ambiente):
    with ambiente.conexao(OWNER) as c:
        c.execute(
            "INSERT INTO auditoria_log (acao, modulo, recurso, descricao) VALUES ('X','m','r','d')"
        )
        for comando in (
            "UPDATE auditoria_log SET descricao = 'alterada'",
            "DELETE FROM auditoria_log",
            "TRUNCATE auditoria_log",
        ):
            with pytest.raises(psycopg.errors.InsufficientPrivilege, match="append-only"):
                c.execute(comando)


def test_role_app_nao_faz_ddl_nem_e_superusuario(ambiente):
    with ambiente.conexao(APP) as c:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("CREATE TABLE intruso (id int)")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("DROP TABLE usuario")
        assert c.execute(
            "SELECT rolsuper FROM pg_roles WHERE rolname = current_user"
        ).fetchone() == (False,)


def test_role_app_opera_tabelas_de_negocio(ambiente):
    with ambiente.conexao(APP) as c:
        c.execute("UPDATE configuracao_empresa SET nome_exibicao = 'Novo'")
        assert c.execute("SELECT nome_exibicao FROM configuracao_empresa").fetchone() == ("Novo",)
