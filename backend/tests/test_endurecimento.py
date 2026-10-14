"""Regressões das correções da revisão independente (segurança, transações e banco)."""

import subprocess
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from pathlib import Path

import psycopg
import pytest
from psycopg import sql
from sqlalchemy import event, text

from app.core.db import get_engine
from conftest import (
    APP,
    BACKEND,
    EMAIL_ADMIN,
    OWNER,
    SENHA_ADMIN,
    _base_env,
    auditoria,
    consultar,
    criar_papel,
    criar_usuario,
    login,
)
from test_relatorios import utc, vender
from test_vendas import comanda_35, contagens, esperado, fechar_como, operador

API = "/api/v1"


def aguardar_espera_por_trava(ambiente, tentativas=100):
    """Gate por estado observável: espera até haver uma sessão bloqueada em trava no banco."""
    for _ in range(tentativas):
        n = consultar(
            ambiente,
            "SELECT count(*) AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()",
        )[0]["n"]
        if n:
            return
        time.sleep(0.05)
    raise AssertionError("nenhuma sessão ficou esperando trava")


# --- desconto: o limite não pode ser contornado cancelando item ---------------------------------


def test_cancelar_item_nao_leva_o_desconto_acima_do_limite_de_quem_cancela(pdv):
    frente, hf = operador(pdv, "Frente", "frente@x.com", "Frente de loja", caixa=None)
    c = frente.post(f"{API}/comandas", headers=hf, json={"tipo": "balcao"}).json()
    corpo = lambda p, q: {"produto_id": p["id"], "quantidade": q}  # noqa: E731
    frente.post(f"{API}/comandas/{c['id']}/itens", headers=hf, json=corpo(pdv.refri, "1"))
    r = frente.post(f"{API}/comandas/{c['id']}/itens", headers=hf, json=corpo(pdv.hamb, "7"))
    enchimento = r.json()["itens"][1]["id"]  # 140,00; subtotal 147,50
    d = frente.post(
        f"{API}/comandas/{c['id']}/ajustes",
        headers=hf,
        json={"tipo": "desconto", "modo": "valor", "valor": "7", "justificativa": "cliente fiel"},
    )
    assert d.status_code == 201  # 4,7% do consumo: dentro dos 5%

    url = f"{API}/comandas/{c['id']}/itens/{enchimento}/cancelar"
    r = frente.post(url, headers=hf, json={"motivo": "desistiu do lanche"})
    assert r.status_code == 403 and r.json()["erro"]["codigo"] == "desconto_acima_do_limite"
    assert pdv.get(f"/comandas/{c['id']}").json()["totais"]["subtotal"] == "147.50"  # nada mudou

    # com desconto percentual o efetivo não cresce: o cancelamento é livre
    pdv_c = pdv.get(f"/comandas/{c['id']}").json()
    pdv.c.delete(f"{API}/comandas/{c['id']}/ajustes/{pdv_c['ajustes'][0]['id']}", headers=pdv.h)
    pdv.post(
        f"/comandas/{c['id']}/ajustes",
        {"tipo": "desconto", "modo": "percentual", "valor": "5", "justificativa": "fidelidade"},
    )
    assert frente.post(url, headers=hf, json={"motivo": "desistiu do lanche"}).status_code == 200


def test_cancelar_o_ultimo_item_com_desconto_em_valor_e_barrado_ate_para_o_admin(pdv):
    c = pdv.comanda()
    item = pdv.item(c, pdv.refri, 1)["itens"][0]
    pdv.post(
        f"/comandas/{c['id']}/ajustes",
        {"tipo": "desconto", "modo": "valor", "valor": "2", "justificativa": "cortesia"},
    )
    r = pdv.post(f"/comandas/{c['id']}/itens/{item['id']}/cancelar", {"motivo": "desistiu"})
    assert r.status_code == 403 and "mais de 100" in r.json()["erro"]["mensagem"]


# --- caixa: corrida entre venda só em fiado e fechamento do caixa --------------------------------


def test_venda_so_em_fiado_nao_entra_em_caixa_que_fechou_enquanto_esperava(pdv):
    cliente = pdv.post(
        "/pessoas",
        {"tipo": "F", "nome": "Fiel", "papeis": ["cliente"], "cliente": {"aceita_fiado": True}},
    ).json()
    c = comanda_35(pdv, balcao=True)
    with pdv.ambiente.conexao_admin() as segura:
        segura.autocommit = False
        segura.execute("SELECT 1 FROM caixa WHERE id = %s FOR UPDATE", (pdv.caixa["id"],))
        with ThreadPoolExecutor(max_workers=1) as pool:
            futuro = pool.submit(
                lambda: (
                    fechar_como(
                        pdv.ambiente.cliente(),
                        pdv.h,
                        c["id"],
                        [pdv.pg("fiado", "35")],
                        cliente_id=cliente["id"],
                    ).status_code
                )
            )
            aguardar_espera_por_trava(pdv.ambiente)  # a venda está esperando a trava do caixa
            segura.execute("UPDATE caixa SET status = 'fechado' WHERE id = %s", (pdv.caixa["id"],))
            segura.commit()
            assert futuro.result(timeout=20) == 409
    assert contagens(pdv)["vendas"] == 0


# --- estoque: custo gravado é o da hora, relido sob a trava ---------------------------------------


def test_movimento_de_venda_grava_o_custo_medio_vigente_depois_da_espera(pdv):
    c = pdv.comanda()
    pdv.item(c, pdv.refri, 1)
    with pdv.ambiente.conexao_admin() as segura:
        segura.autocommit = False
        segura.execute(
            "SELECT 1 FROM estoque_saldo WHERE produto_id = %s FOR UPDATE", (pdv.refri["id"],)
        )
        with ThreadPoolExecutor(max_workers=1) as pool:
            futuro = pool.submit(
                lambda: (
                    fechar_como(
                        pdv.ambiente.cliente(), pdv.h, c["id"], [pdv.pg("pix", "7.50")]
                    ).status_code
                )
            )
            aguardar_espera_por_trava(pdv.ambiente)
            segura.execute(
                "UPDATE produto SET custo_medio = 4.2500 WHERE id = %s", (pdv.refri["id"],)
            )
            segura.commit()
            assert futuro.result(timeout=20) == 201
    mov = consultar(
        pdv.ambiente,
        "SELECT custo_unitario FROM movimento_estoque WHERE tipo = 'venda' AND produto_id = %s",
        pdv.refri["id"],
    )
    assert mov[0]["custo_unitario"] == Decimal("4.2500")


def test_estorno_repete_o_custo_da_venda_original(pdv):
    v = fechar_como(pdv.c, pdv.h, comanda_35(pdv)["id"], [pdv.pg("pix", "35")]).json()
    pdv.c.post(
        f"{API}/estoque/entradas",
        headers=pdv.h,
        json={"produto_id": pdv.pao["id"], "quantidade": "100", "custo_unitario": "9"},
    )
    assert pdv.post(f"/vendas/{v['id']}/estornar", {"motivo": "teste de custo"}).status_code == 200
    custos = consultar(
        pdv.ambiente,
        "SELECT tipo, custo_unitario FROM movimento_estoque WHERE produto_id = %s AND tipo IN ('venda', 'estorno_venda') ORDER BY id",
        pdv.pao["id"],
    )
    assert custos[0]["tipo"] == "venda" and custos[1]["tipo"] == "estorno_venda"
    assert (
        custos[0]["custo_unitario"] == custos[1]["custo_unitario"] == Decimal("0.5000")
    )  # não os 9,00 de hoje


# --- auditoria não derruba a operação -------------------------------------------------------------


def test_login_de_usuario_com_muitos_papeis_longos_nao_estoura_a_auditoria(ambiente):
    nomes = [f"Papel {i} " + "x" * 50 for i in range(4)]  # 4 × ~57 chars > 200
    for nome in nomes:
        criar_papel(nome, [])
    criar_usuario("Multi", "multi@x.com", papeis=tuple(nomes))
    c = ambiente.cliente()
    r = c.post(f"{API}/auth/login", json={"email": "multi@x.com", "senha": "OutraSenha#2026"})
    assert r.status_code == 200
    [log] = auditoria(ambiente, acao="LOGIN", usuario_nome="Multi")
    assert len(log["papel"]) == 200


# --- entradas absurdas viram 422, nunca 500 -------------------------------------------------------


@pytest.mark.parametrize(
    "valor", ["1e30", "99999999999999999", "1e999999", "NaN", "-1e12", "1000000000000"]
)
def test_valor_fora_do_limite_da_coluna_e_recusado_com_422(admin, valor):
    c, h = admin
    r = c.post(f"{API}/caixas/abrir", headers=h, json={"valor_abertura": valor})
    assert r.status_code == 422, (valor, r.text)


def test_valor_no_limite_passa_e_deslocamento_gigante_e_recusado(admin):
    c, h = admin
    assert (
        c.post(
            f"{API}/caixas/abrir", headers=h, json={"valor_abertura": "999999999999.99"}
        ).status_code
        == 201
    )
    assert (
        c.get(
            f"{API}/usuarios", headers=h, params={"deslocamento": "99999999999999999999"}
        ).status_code
        == 422
    )


def test_timeouts_do_banco_estao_ligados_para_a_api(ambiente):
    with get_engine().connect() as conn:
        assert conn.execute(text("SHOW lock_timeout")).scalar() == "5s"
        assert conn.execute(text("SHOW statement_timeout")).scalar() == "30s"
        assert conn.execute(text("SHOW idle_in_transaction_session_timeout")).scalar() == "1min"


def test_timeout_de_trava_vira_409_e_nao_500(pdv):
    """Uma trava presa por outra transação não deixa a requisição esperando para sempre."""
    c = pdv.comanda()
    pdv.item(c, pdv.refri, 1)
    with pdv.ambiente.conexao_admin() as segura:
        segura.autocommit = False
        segura.execute("SELECT 1 FROM comanda WHERE id = %s FOR UPDATE", (c["id"],))
        inicio = time.monotonic()
        r = pdv.post(
            f"/comandas/{c['id']}/itens", {"produto_id": pdv.refri["id"], "quantidade": "1"}
        )
        espera = time.monotonic() - inicio
        segura.rollback()
    assert r.status_code == 409 and r.json()["erro"]["codigo"] == "recurso_ocupado"
    assert r.headers["retry-after"] == "1" and 4 <= espera < 12


# --- append-only: toda tabela está classificada e protegida -----------------------------------------

IMUTAVEIS = {
    "auditoria_log", "movimento_estoque", "movimento_caixa", "caixa_evento", "comanda_evento",
    "titulo_receber_baixa", "venda", "venda_item", "venda_pagamento", "venda_estorno",
    "caixa_conferencia",
}  # fmt: skip
MUTAVEIS = {
    "usuario", "papel", "permissao", "papel_permissao", "usuario_papel", "refresh_token",
    "configuracao_empresa", "pessoa", "pessoa_papel", "pessoa_endereco", "pessoa_cliente",
    "unidade_medida", "categoria_produto", "produto", "produto_composicao", "estoque_saldo",
    "inventario", "inventario_item", "mesa", "comanda", "comanda_item", "comanda_ajuste",
    "forma_pagamento", "caixa", "categoria_financeira", "titulo_receber", "alembic_version",
}  # fmt: skip


def test_toda_tabela_esta_classificada_e_as_imutaveis_estao_protegidas(ambiente):
    tabelas = {
        r["table_name"]
        for r in consultar(
            ambiente,
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
        )
    }
    # Tabela nova precisa ser classificada aqui: histórico (imutável) ou dado mutável.
    assert tabelas == IMUTAVEIS | MUTAVEIS, f"sem classificação: {tabelas ^ (IMUTAVEIS | MUTAVEIS)}"
    with ambiente.conexao_admin() as conn:
        for t in sorted(IMUTAVEIS):
            triggers = {
                r[0]
                for r in conn.execute(
                    "SELECT tgname FROM pg_trigger WHERE tgrelid = %s::regclass AND NOT tgisinternal",
                    (t,),
                ).fetchall()
            }
            assert {f"{t}_append_only", f"{t}_append_only_truncate"} <= triggers, t
            for privilegio in ("UPDATE", "DELETE", "TRUNCATE"):
                tem = conn.execute(
                    "SELECT has_table_privilege(%s, %s, %s)", (APP[0], t, privilegio)
                ).fetchone()[0]
                assert tem is False, f"{APP[0]} ainda tem {privilegio} em {t}"
        for t in (
            "pessoa",
            "estoque_saldo",
            "titulo_receber",
        ):  # contraprova: mutáveis seguem editáveis
            assert conn.execute(
                "SELECT has_table_privilege(%s, %s, 'UPDATE')", (APP[0], t)
            ).fetchone()[0]


def test_historico_de_venda_nao_se_apaga_nem_se_altera_pela_api(pdv):
    fechar_como(pdv.c, pdv.h, comanda_35(pdv)["id"], [pdv.pg("pix", "35")])
    with pdv.ambiente.conexao(APP) as conn:
        for comando in (
            "UPDATE venda SET total = 1",
            "DELETE FROM venda_item",
            "DELETE FROM venda_pagamento",
            "UPDATE caixa_conferencia SET diferenca = 0",
            "DELETE FROM venda_estorno",
        ):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute(comando)
    with pdv.ambiente.conexao(OWNER) as conn:
        with pytest.raises(psycopg.errors.InsufficientPrivilege, match="append-only"):
            conn.execute("UPDATE venda SET total = 1")


def test_migrations_sobem_descem_e_sobem_de_novo(template_migrado):
    """Ciclo completo em banco novo (roles iguais aos de produção) e nomes de constraint sem colisão."""
    nome = f"mig_{uuid.uuid4().hex[:10]}"
    with psycopg.connect(
        "postgresql://pdv_admin:pdv_admin_test@127.0.0.1:55432/postgres", autocommit=True
    ) as conn:
        conn.execute(
            sql.SQL("CREATE DATABASE {} TEMPLATE pdv_test OWNER pdv_owner").format(
                sql.Identifier(nome)
            )
        )
    try:
        import os

        env = {**os.environ, **_base_env(nome)}
        for args in (["upgrade", "head"], ["downgrade", "base"], ["upgrade", "head"]):
            r = subprocess.run(  # noqa: S603
                [sys.executable, "-m", "alembic", *args],
                cwd=Path(BACKEND),
                env=env,
                capture_output=True,
                text=True,
            )
            assert r.returncode == 0, r.stderr[-800:]
    finally:
        with psycopg.connect(
            "postgresql://pdv_admin:pdv_admin_test@127.0.0.1:55432/postgres", autocommit=True
        ) as conn:
            conn.execute(
                sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(nome))
            )


# --- usuários e papéis: ninguém altera quem tem mais poder; limite é privilégio ------------------


def test_gerente_nao_altera_usuario_com_papel_personalizado_mais_poderoso(ambiente):
    criar_papel("Supervisor TI", ["usuarios.listar", "configuracoes.editar", "papeis.editar"])
    alvo = criar_usuario("Alvo", "alvo@x.com", papeis=("Supervisor TI",))
    criar_usuario("Ger", "ger@x.com", papeis=("Gerente",))
    c = ambiente.cliente()
    h = login(c, "ger@x.com", "OutraSenha#2026")
    for acao in (
        lambda: c.post(
            f"{API}/usuarios/{alvo}/redefinir-senha",
            headers=h,
            json={"senha_temporaria": "Temporaria#123"},
        ),
        lambda: c.post(f"{API}/usuarios/{alvo}/suspender", headers=h),
        lambda: c.patch(f"{API}/usuarios/{alvo}", headers=h, json={"nome": "Hackeado"}),
    ):
        r = acao()
        assert r.status_code == 403 and r.json()["erro"]["codigo"] == "usuario_acima_do_seu"
    assert consultar(
        ambiente, "SELECT suspenso, deleted_at, nome FROM usuario WHERE id = %s", alvo
    )[0] == {
        "suspenso": False,
        "deleted_at": None,
        "nome": "Alvo",
    }
    # usuário de poder igual ou menor continua gerenciável
    igual = criar_usuario("Igual", "igual@x.com", papeis=("Gerente",))
    assert c.post(f"{API}/usuarios/{igual}/suspender", headers=h).status_code == 200


def test_limite_de_desconto_e_privilegio_nao_se_concede_acima_do_seu(ambiente):
    criar_papel("Delegado", ["papeis.listar", "papeis.criar", "papeis.editar", "usuarios.listar"])
    criar_usuario("Del", "del@x.com", papeis=("Delegado",))
    adm = ambiente.cliente()
    ha = login(adm, EMAIL_ADMIN, SENHA_ADMIN)
    livre = adm.post(
        f"{API}/papeis",
        headers=ha,
        json={
            "nome": "Desconto livre",
            "limite_desconto_pct": "100",
            "permissoes": ["comandas.desconto"],
        },
    )
    assert livre.status_code == 201

    d = ambiente.cliente()
    hd = login(d, "del@x.com", "OutraSenha#2026")
    meu = next(p for p in d.get(f"{API}/papeis", headers=hd).json() if p["nome"] == "Delegado")
    r = d.patch(f"{API}/papeis/{meu['id']}", headers=hd, json={"limite_desconto_pct": "100"})
    assert r.status_code == 403 and r.json()["erro"]["codigo"] == "limite_acima_do_seu"
    r = d.post(f"{API}/papeis", headers=hd, json={"nome": "Outro", "limite_desconto_pct": "50"})
    assert r.status_code == 403 and r.json()["erro"]["codigo"] == "limite_acima_do_seu"
    assert (
        d.patch(f"{API}/papeis/{meu['id']}", headers=hd, json={"descricao": "ok"}).status_code
        == 200
    )

    # atribuição: o gerente (limite 20%) não se dá um papel com limite 100%
    criar_usuario("Ger", "ger@x.com", papeis=("Gerente",))
    g = ambiente.cliente()
    hg = login(g, "ger@x.com", "OutraSenha#2026")
    eu = g.get(f"{API}/auth/me", headers=hg).json()["id"]
    gerente_id = next(
        p["id"] for p in g.get(f"{API}/papeis", headers=hg).json() if p["nome"] == "Gerente"
    )
    r = g.patch(
        f"{API}/usuarios/{eu}", headers=hg, json={"papeis": [gerente_id, livre.json()["id"]]}
    )
    assert r.status_code == 403 and r.json()["erro"]["codigo"] == "papel_acima_do_seu"


def test_dois_administradores_suspendendo_um_ao_outro_nao_deixam_a_empresa_sem_administrador(
    ambiente,
):
    ids = []
    for i in range(10):  # a corrida só aparece em algumas rodadas: repetir
        a = criar_usuario(f"Admin A{i}", f"a{i}@x.com", papeis=("Administrador",))
        b = criar_usuario(f"Admin B{i}", f"b{i}@x.com", papeis=("Administrador",))
        ca, cb = ambiente.cliente(), ambiente.cliente()
        ha, hb = (
            login(ca, f"a{i}@x.com", "OutraSenha#2026"),
            login(cb, f"b{i}@x.com", "OutraSenha#2026"),
        )

        def suspender(cliente, headers, alvo):
            return cliente.post(f"{API}/usuarios/{alvo}/suspender", headers=headers).status_code

        with pdv_pool() as pool:
            r1 = pool.submit(suspender, ca, ha, b)
            r2 = pool.submit(suspender, cb, hb, a)
            r1.result(), r2.result()
        ativos = consultar(
            ambiente,
            "SELECT count(*) AS n FROM usuario u JOIN usuario_papel up ON up.usuario_id = u.id JOIN papel p ON p.id = up.papel_id WHERE p.nome = 'Administrador' AND NOT u.suspenso AND u.deleted_at IS NULL",
        )[0]["n"]
        assert ativos >= 1, f"rodada {i}: nenhum administrador ativo"
        ids += [a, b]
        # reativa tudo para a próxima rodada
        with ambiente.conexao_admin() as conn:
            conn.execute("UPDATE usuario SET suspenso = false")
    assert ids


def pdv_pool():
    return ThreadPoolExecutor(max_workers=2)


# --- sessão: bloqueio por falhas, tokens invalidados, política de senha -----------------------------


def test_conta_bloqueia_apos_falhas_seguidas_e_volta_a_funcionar(ambiente):
    c = ambiente.cliente()
    for _ in range(8):
        r = c.post(f"{API}/auth/login", json={"email": EMAIL_ADMIN, "senha": "errada-errada"})
        assert r.status_code == 401
    r = c.post(
        f"{API}/auth/login", json={"email": EMAIL_ADMIN, "senha": SENHA_ADMIN}
    )  # senha certa
    assert r.status_code == 429 and r.json()["erro"]["codigo"] == "conta_bloqueada"
    assert int(r.headers["retry-after"]) > 0
    assert any("bloqueada" in x["descricao"] for x in auditoria(ambiente, acao="LOGIN_FALHA"))
    with ambiente.conexao_admin() as conn:  # passado o tempo de bloqueio
        conn.execute("UPDATE usuario SET bloqueado_ate = now() - interval '1 minute'")
    assert (
        c.post(f"{API}/auth/login", json={"email": EMAIL_ADMIN, "senha": SENHA_ADMIN}).status_code
        == 200
    )
    assert consultar(
        ambiente, "SELECT falhas_login, bloqueado_ate FROM usuario WHERE email = %s", EMAIL_ADMIN
    )[0] == {
        "falhas_login": 0,
        "bloqueado_ate": None,
    }
    # e-mail inexistente nunca bloqueia nada nem muda a resposta
    outro = [
        c.post(f"{API}/auth/login", json={"email": "ninguem@x.com", "senha": "x"}).status_code
        for _ in range(10)
    ]
    assert outro == [401] * 10


def test_senha_atual_errada_na_troca_conta_como_tentativa_e_fica_na_auditoria(ambiente):
    c = ambiente.cliente()
    h = login(c, EMAIL_ADMIN, SENHA_ADMIN)
    for _ in range(8):
        r = c.post(
            f"{API}/auth/change-password",
            headers=h,
            json={"senha_atual": "errada!!!!", "nova_senha": "NovaSenha#2027x"},
        )
        assert r.status_code == 422
    assert (
        len([x for x in auditoria(ambiente, acao="LOGIN_FALHA") if "senha atual" in x["descricao"]])
        == 8
    )
    assert (
        c.post(f"{API}/auth/login", json={"email": EMAIL_ADMIN, "senha": SENHA_ADMIN}).status_code
        == 429
    )


def test_login_falho_nao_guarda_senha_digitada_no_campo_de_email(ambiente):
    ambiente.cliente().post(
        f"{API}/auth/login", json={"email": "MinhaSenhaSecreta#2026", "senha": "x"}
    )
    [log] = auditoria(ambiente, acao="LOGIN_FALHA")
    assert (
        "MinhaSenhaSecreta" not in log["descricao"]
        and "formato de e-mail inválido" in log["descricao"]
    )


def test_politica_de_senha_recusa_senha_comum_e_com_o_proprio_email(ambiente):
    c = ambiente.cliente()
    h = login(c, EMAIL_ADMIN, SENHA_ADMIN)
    papel = next(
        p["id"] for p in c.get(f"{API}/papeis", headers=h).json() if p["nome"] == "Atendente"
    )
    base = {"nome": "N", "email": "joaquim.silva@x.com", "papeis": [papel]}
    for senha in ("senha123456", "joaquim.silva2026", "Qwertyuiop"):
        r = c.post(f"{API}/usuarios", headers=h, json=base | {"senha_temporaria": senha})
        assert r.json()["erro"]["codigo"] == "senha_fraca", senha
    assert (
        c.post(
            f"{API}/usuarios", headers=h, json=base | {"senha_temporaria": "Temporaria#123"}
        ).status_code
        == 201
    )


def test_logout_troca_de_senha_e_redefinicao_invalidam_os_tokens_ja_emitidos(ambiente):
    uid = criar_usuario("Tok", "tok@x.com", papeis=("Gerente",))
    me = lambda cli, h: cli.get(f"{API}/auth/me", headers=h).status_code  # noqa: E731

    c1 = ambiente.cliente()
    h1 = login(c1, "tok@x.com", "OutraSenha#2026")
    assert me(c1, h1) == 200
    c1.post(f"{API}/auth/logout")
    assert me(c1, h1) == 401  # o token antigo morreu com o logout
    h1b = login(ambiente.cliente(), "tok@x.com", "OutraSenha#2026")  # login novo vale
    assert me(ambiente.cliente(), h1b) == 200

    c2 = ambiente.cliente()
    h2 = login(c2, "tok@x.com", "OutraSenha#2026")
    r = c2.post(
        f"{API}/auth/change-password",
        headers=h2,
        json={"senha_atual": "OutraSenha#2026", "nova_senha": "NovaSenha#2027x"},
    )
    assert r.status_code == 200
    assert me(c2, h2) == 401  # token anterior à troca
    assert me(c2, {"Authorization": f"Bearer {r.json()['access_token']}"}) == 200  # o novo vale

    c3 = ambiente.cliente()
    h3 = login(c3, "tok@x.com", "NovaSenha#2027x")
    adm = ambiente.cliente()
    ha = login(adm, EMAIL_ADMIN, SENHA_ADMIN)
    assert (
        adm.post(
            f"{API}/usuarios/{uid}/redefinir-senha",
            headers=ha,
            json={"senha_temporaria": "Reset#Temp123"},
        ).status_code
        == 204
    )
    assert me(c3, h3) == 401


# --- privacidade: CPF/CNPJ só para quem precisa --------------------------------------------------


def test_atendente_ve_documento_mascarado_e_nao_busca_por_ele(ambiente):
    adm = ambiente.cliente()
    ha = login(adm, EMAIL_ADMIN, SENHA_ADMIN)
    adm.post(
        f"{API}/pessoas",
        headers=ha,
        json={"tipo": "F", "nome": "Maria", "documento": "529.982.247-25", "papeis": ["cliente"]},
    )
    criar_usuario("Ana", "ana@x.com", papeis=("Atendente",))
    ger_id = criar_usuario("Ger", "ger@x.com", papeis=("Gerente",))
    assert ger_id
    a, g = ambiente.cliente(), ambiente.cliente()
    hat, hg = login(a, "ana@x.com", "OutraSenha#2026"), login(g, "ger@x.com", "OutraSenha#2026")

    lista = a.get(f"{API}/pessoas", headers=hat).json()["itens"]
    assert lista[0]["documento"] == "***25"
    assert (
        a.get(f"{API}/pessoas", headers=hat, params={"q": "529982"}).json()["total"] == 0
    )  # sem enumeração
    assert a.get(f"{API}/pessoas", headers=hat, params={"q": "Maria"}).json()["total"] == 1
    assert g.get(f"{API}/pessoas", headers=hg).json()["itens"][0]["documento"] == "52998224725"
    assert g.get(f"{API}/pessoas", headers=hg, params={"q": "529982"}).json()["total"] == 1


def test_limite_de_fiado_negativo_e_recusado(admin):
    c, h = admin
    r = c.post(
        f"{API}/pessoas",
        headers=h,
        json={
            "tipo": "F",
            "nome": "X",
            "papeis": ["cliente"],
            "cliente": {"aceita_fiado": True, "limite_fiado": "-1"},
        },
    )
    assert r.status_code == 422


# --- catálogo, baixa idempotente, datas, consultas ------------------------------------------------


def test_nao_desliga_o_controle_de_estoque_de_insumo_usado_em_ficha(pdv):
    r = pdv.c.patch(
        f"{API}/produtos/{pdv.pao['id']}", headers=pdv.h, json={"controla_estoque": False}
    )
    assert r.status_code == 409 and r.json()["erro"]["codigo"] == "produto_em_uso"


def test_baixa_com_a_mesma_chave_lanca_uma_unica_vez(pdv):
    cliente = pdv.post(
        "/pessoas",
        {"tipo": "F", "nome": "Fiel", "papeis": ["cliente"], "cliente": {"aceita_fiado": True}},
    ).json()
    fechar_como(
        pdv.c,
        pdv.h,
        comanda_35(pdv, balcao=True)["id"],
        [pdv.pg("fiado", "35")],
        cliente_id=cliente["id"],
    )
    titulo = pdv.get("/contas-receber").json()["itens"][0]
    url = f"/contas-receber/{titulo['id']}/baixas"
    corpo = {"valor": "10", "forma_pagamento_id": pdv.formas["pix"], "chave": "tentativa-0001"}
    primeira = pdv.post(url, corpo)
    repetida = pdv.post(url, corpo)  # clique duplo / retry de rede
    assert primeira.status_code == repetida.status_code == 201
    assert repetida.json()["valor_pago"] == "10.00" and len(repetida.json()["baixas"]) == 1
    assert esperado(pdv) == {"dinheiro": "100.00", "pix": "10.00"}
    outra = pdv.post(url, corpo | {"chave": "tentativa-0002"})
    assert outra.json()["valor_pago"] == "20.00" and esperado(pdv)["pix"] == "20.00"
    assert pdv.post(url, corpo | {"chave": "curta"}).status_code == 422
    # sem chave continua funcionando como antes
    assert (
        pdv.post(url, {"valor": "5", "forma_pagamento_id": pdv.formas["pix"]}).json()["valor_pago"]
        == "25.00"
    )


def test_datas_sem_fuso_valem_no_fuso_da_empresa(pdv):
    # 02:00 UTC de 14/10 = 23:00 de 13/10 em Fortaleza (UTC-3)
    vender(pdv, [(pdv.refri, 1)], [pdv.pg("pix", "7.50")], utc("2026-10-14", "02:00"))
    antes = pdv.get("/vendas", de="2026-10-14", ate="2026-10-15").json()["total"]
    do_dia_13 = pdv.get("/vendas", de="2026-10-13", ate="2026-10-14").json()["total"]
    assert (antes, do_dia_13) == (0, 1)  # lido como UTC, a venda cairia em 14/10
    # com fuso explícito, vale o que foi dito
    assert (
        pdv.get("/vendas", de="2026-10-14T00:00:00Z", ate="2026-10-15T00:00:00Z").json()["total"]
        == 1
    )


def test_listagens_e_relatorio_de_caixa_nao_fazem_n_mais_1(pdv):
    consultas = []

    @event.listens_for(get_engine(), "before_cursor_execute")
    def contar(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001, ARG001
        consultas.append(statement)

    try:
        for i in range(4):  # 5 caixas (com o do pdv) e 4 títulos de fiado
            op, hop = operador(pdv, f"Op{i}", f"op{i}@x.com", "Gerente", caixa="10")
            assert op
        cliente = pdv.post(
            "/pessoas",
            {"tipo": "F", "nome": "Fiel", "papeis": ["cliente"], "cliente": {"aceita_fiado": True}},
        ).json()
        for _ in range(4):
            fechar_como(
                pdv.c,
                pdv.h,
                comanda_35(pdv, balcao=True)["id"],
                [pdv.pg("fiado", "35")],
                cliente_id=cliente["id"],
            )
        hoje = time.strftime("%Y-%m-%d")

        consultas.clear()
        assert pdv.get("/contas-receber").json()["total"] == 4
        assert len(consultas) <= 14, f"/contas-receber fez {len(consultas)} consultas"
        consultas.clear()
        assert pdv.get("/relatorios/caixa", de=hoje, ate=hoje).json()["caixas_qtd"] >= 5
        assert len(consultas) <= 18, f"/relatorios/caixa fez {len(consultas)} consultas"
    finally:
        event.remove(get_engine(), "before_cursor_execute", contar)
