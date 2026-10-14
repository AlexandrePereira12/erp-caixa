from datetime import UTC, datetime, timedelta

import jwt

from app.core.config import get_settings
from conftest import EMAIL_ADMIN, SENHA_ADMIN, auditoria, consultar, criar_usuario, login

API = "/api/v1"


def test_login_ok_define_cookie_seguro_e_audita(ambiente):
    c = ambiente.cliente()
    r = c.post(f"{API}/auth/login", json={"email": EMAIL_ADMIN.upper(), "senha": SENHA_ADMIN})
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["token_type"] == "bearer" and corpo["expires_in"] == 900
    assert corpo["must_change_password"] is False
    cookie = r.headers["set-cookie"].lower()
    for atributo in ("httponly", "secure", "samesite=strict", "path=/api/v1/auth"):
        assert atributo in cookie
    assert "x-request-id" in r.headers

    [log] = auditoria(ambiente, acao="LOGIN")
    assert log["usuario_nome"] == "Admin Teste" and log["papel"] == "Administrador"
    assert log["request_id"] == r.headers["x-request-id"]


def test_login_invalido_mesma_resposta_e_audita_falha_mesmo_com_erro(ambiente):
    c = ambiente.cliente()
    errada = c.post(f"{API}/auth/login", json={"email": EMAIL_ADMIN, "senha": "errada"})
    inexistente = c.post(f"{API}/auth/login", json={"email": "ninguem@x.com", "senha": "errada"})
    assert errada.status_code == inexistente.status_code == 401
    assert errada.json() == inexistente.json()
    assert errada.json()["erro"]["codigo"] == "credenciais_invalidas"
    assert "set-cookie" not in errada.headers
    falhas = auditoria(ambiente, acao="LOGIN_FALHA")
    assert len(falhas) == 2
    assert "senha" not in " ".join(f["descricao"] for f in falhas).lower().replace(
        "falha de login", ""
    )


def test_conta_suspensa_nao_entra(ambiente):
    criar_usuario("Sus", "sus@x.com", suspenso=True)
    r = ambiente.cliente().post(
        f"{API}/auth/login", json={"email": "sus@x.com", "senha": "OutraSenha#2026"}
    )
    assert r.status_code == 403 and r.json()["erro"]["codigo"] == "conta_suspensa"


def test_suspensao_vale_na_hora_para_token_ja_emitido(ambiente):
    uid = criar_usuario("Joana", "joana@x.com")
    c = ambiente.cliente()
    h = login(c, "joana@x.com", "OutraSenha#2026")
    assert c.get(f"{API}/auth/me", headers=h).status_code == 200
    with ambiente.conexao_admin() as conn:
        conn.execute("UPDATE usuario SET suspenso = true WHERE id = %s", (uid,))
    r = c.get(f"{API}/auth/me", headers=h)
    assert r.status_code == 403 and r.json()["erro"]["codigo"] == "conta_suspensa"


def test_token_expirado_ou_ausente(ambiente):
    c = ambiente.cliente()
    assert c.get(f"{API}/auth/me").status_code == 401
    vencido = jwt.encode(
        {
            "sub": "1",
            "iat": datetime.now(UTC) - timedelta(hours=2),
            "exp": datetime.now(UTC) - timedelta(hours=1),
        },
        get_settings().jwt_secret,
        "HS256",
    )
    r = c.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {vencido}"})
    assert r.status_code == 401 and r.json()["erro"]["codigo"] == "token_invalido"


def test_refresh_rotaciona_e_reuso_derruba_a_familia(ambiente):
    c = ambiente.cliente()
    c.post(f"{API}/auth/login", json={"email": EMAIL_ADMIN, "senha": SENHA_ADMIN})
    antigo = c.cookies.get("pdv_refresh")

    r = c.post(f"{API}/auth/refresh")
    assert r.status_code == 200
    novo = c.cookies.get("pdv_refresh")
    assert novo and novo != antigo

    # Reapresentar o token antigo = sinal de roubo: 401 e o token novo também morre.
    ladrao = ambiente.cliente()
    ladrao.cookies.set("pdv_refresh", antigo, path="/api/v1/auth")
    assert ladrao.post(f"{API}/auth/refresh").status_code == 401
    assert c.post(f"{API}/auth/refresh").status_code == 401

    # Um registro para o ladrão e outro para o cliente legítimo, que agora apresenta token revogado.
    negados = auditoria(ambiente, acao="ACESSO_NEGADO", recurso="refresh_token")
    assert len(negados) == 2 and all("Reuso" in n["descricao"] for n in negados)


def test_refresh_sem_cookie_ou_invalido(ambiente):
    c = ambiente.cliente()
    assert c.post(f"{API}/auth/refresh").status_code == 401
    c.cookies.set("pdv_refresh", "lixo", path="/api/v1/auth")
    assert c.post(f"{API}/auth/refresh").status_code == 401


def test_refresh_guarda_apenas_o_hash(ambiente):
    c = ambiente.cliente()
    c.post(f"{API}/auth/login", json={"email": EMAIL_ADMIN, "senha": SENHA_ADMIN})
    token = c.cookies.get("pdv_refresh")
    [linha] = consultar(ambiente, "SELECT token_hash FROM refresh_token")
    assert token not in linha["token_hash"] and len(linha["token_hash"]) == 64


def test_logout_revoga_e_audita(ambiente):
    c = ambiente.cliente()
    c.post(f"{API}/auth/login", json={"email": EMAIL_ADMIN, "senha": SENHA_ADMIN})
    antigo = c.cookies.get("pdv_refresh")
    assert c.post(f"{API}/auth/logout").status_code == 204
    c.cookies.set("pdv_refresh", antigo, path="/api/v1/auth")
    assert c.post(f"{API}/auth/refresh").status_code == 401
    assert len(auditoria(ambiente, acao="LOGOUT")) == 1
    # logout sem sessão é inofensivo
    assert ambiente.cliente().post(f"{API}/auth/logout").status_code == 204


def test_me_lista_permissoes(ambiente):
    c = ambiente.cliente()
    h = login(c, EMAIL_ADMIN, SENHA_ADMIN)
    me = c.get(f"{API}/auth/me", headers=h).json()
    assert me["papeis"] == ["Administrador"]
    assert "usuarios.criar" in me["permissoes"] and me["email"] == EMAIL_ADMIN


def test_troca_de_senha_obrigatoria_bloqueia_o_resto(ambiente):
    criar_usuario("Novo", "novo@x.com", papeis=("Gerente",), must_change=True)
    c = ambiente.cliente()
    h = login(c, "novo@x.com", "OutraSenha#2026")
    assert c.get(f"{API}/auth/me", headers=h).json()["must_change_password"] is True
    r = c.get(f"{API}/usuarios", headers=h)
    assert r.status_code == 403 and r.json()["erro"]["codigo"] == "senha_expirada"


def test_trocar_senha_regras_e_efeitos(ambiente):
    criar_usuario("Novo", "novo@x.com", papeis=("Gerente",), must_change=True)
    c = ambiente.cliente()
    h = login(c, "novo@x.com", "OutraSenha#2026")
    antigo = c.cookies.get("pdv_refresh")

    def trocar(atual, nova):
        return c.post(
            f"{API}/auth/change-password",
            headers=h,
            json={"senha_atual": atual, "nova_senha": nova},
        )

    assert trocar("errada", "NovaSenha#2026").json()["erro"]["codigo"] == "senha_atual_incorreta"
    assert trocar("OutraSenha#2026", "OutraSenha#2026").json()["erro"]["codigo"] == "senha_repetida"
    assert trocar("OutraSenha#2026", "curta").json()["erro"]["codigo"] == "senha_fraca"

    r = trocar("OutraSenha#2026", "NovaSenha#2026")
    assert r.status_code == 200 and r.json()["must_change_password"] is False
    h2 = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert c.get(f"{API}/usuarios", headers=h2).status_code == 200  # gate liberado

    # sessão anterior foi revogada
    velho = ambiente.cliente()
    velho.cookies.set("pdv_refresh", antigo, path="/api/v1/auth")
    assert velho.post(f"{API}/auth/refresh").status_code == 401
    # senha antiga não entra mais, a nova entra
    assert (
        ambiente.cliente()
        .post(f"{API}/auth/login", json={"email": "novo@x.com", "senha": "OutraSenha#2026"})
        .status_code
        == 401
    )
    login(ambiente.cliente(), "novo@x.com", "NovaSenha#2026")

    [log] = auditoria(ambiente, acao="UPDATE", modulo="auth")
    assert log["antes"] == {"must_change_password": True} and log["depois"] == {
        "must_change_password": False
    }
    todo = str(consultar(ambiente, "SELECT * FROM auditoria_log"))
    assert "NovaSenha#2026" not in todo and "OutraSenha#2026" not in todo


def test_health(ambiente):
    r = ambiente.cliente().get(f"{API}/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}
