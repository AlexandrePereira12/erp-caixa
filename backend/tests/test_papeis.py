from sqlalchemy import select

from app.core.db import get_sessionmaker
from app.modules.rbac import service as rbac
from app.modules.rbac.catalog import PAPEIS_PADRAO, PERMISSOES
from app.modules.rbac.models import Papel, Permissao
from conftest import EMAIL_ADMIN, SENHA_ADMIN, auditoria, criar_papel, criar_usuario, login

API = "/api/v1"


def _admin(ambiente):
    c = ambiente.cliente()
    return c, login(c, EMAIL_ADMIN, SENHA_ADMIN)


def _papeis(c, h):
    return {p["nome"]: p for p in c.get(f"{API}/papeis", headers=h).json()}


def test_papeis_de_sistema_e_permissoes_padrao(ambiente):
    c, h = _admin(ambiente)
    papeis = _papeis(c, h)
    assert set(papeis) == {"Administrador", "Gerente", "Frente de loja", "Atendente"}
    assert all(p["sistema"] for p in papeis.values())
    codigos = {p["codigo"] for p in papeis["Administrador"]["permissoes"]}
    assert codigos == {p.codigo for p in PERMISSOES}
    gerente = {p["codigo"] for p in papeis["Gerente"]["permissoes"]}
    assert "usuarios.criar" in gerente and "auditoria.listar" in gerente
    assert not gerente & {"usuarios.gerir_administradores", "papeis.editar", "configuracoes.editar"}
    assert len(c.get(f"{API}/permissoes", headers=h).json()) == len(PERMISSOES)


def test_alterar_permissoes_do_papel_audita_antes_e_depois(ambiente):
    c, h = _admin(ambiente)
    atendente = _papeis(c, h)["Atendente"]["id"]
    r = c.put(
        f"{API}/papeis/{atendente}/permissoes", headers=h, json={"permissoes": ["usuarios.listar"]}
    )
    assert r.status_code == 200 and [p["codigo"] for p in r.json()["permissoes"]] == [
        "usuarios.listar"
    ]
    [log] = auditoria(ambiente, acao="ALTERACAO_PERMISSAO", modulo="papeis")
    assert log["antes"] == {"permissoes": sorted(PAPEIS_PADRAO["Atendente"][1])}
    assert log["depois"] == {"permissoes": ["usuarios.listar"]}
    assert "concedidas: usuarios.listar" in log["descricao"]
    assert "removidas: catalogo.listar" in log["descricao"]
    assert (
        c.put(
            f"{API}/papeis/{atendente}/permissoes", headers=h, json={"permissoes": ["x.y"]}
        ).json()["erro"]["codigo"]
        == "permissao_invalida"
    )


def test_administrador_e_papeis_de_sistema_sao_protegidos(ambiente):
    c, h = _admin(ambiente)
    papeis = _papeis(c, h)
    adm, ger = papeis["Administrador"]["id"], papeis["Gerente"]["id"]
    assert (
        c.put(f"{API}/papeis/{adm}/permissoes", headers=h, json={"permissoes": []}).json()["erro"][
            "codigo"
        ]
        == "papel_protegido"
    )
    assert (
        c.patch(f"{API}/papeis/{ger}", headers=h, json={"nome": "Outro"}).json()["erro"]["codigo"]
        == "papel_protegido"
    )
    assert c.delete(f"{API}/papeis/{ger}", headers=h).json()["erro"]["codigo"] == "papel_protegido"
    # descrição de papel de sistema pode mudar
    assert c.patch(f"{API}/papeis/{ger}", headers=h, json={"descricao": "Nova"}).status_code == 200


def test_papel_personalizado_ciclo_completo(ambiente):
    c, h = _admin(ambiente)
    r = c.post(
        f"{API}/papeis",
        headers=h,
        json={"nome": "Estoquista", "descricao": "Estoque", "permissoes": ["auditoria.listar"]},
    )
    assert r.status_code == 201
    pid = r.json()["id"]
    assert (
        c.post(f"{API}/papeis", headers=h, json={"nome": "estoquista"}).json()["erro"]["codigo"]
        == "papel_nome_em_uso"
    )
    assert (
        c.patch(f"{API}/papeis/{pid}", headers=h, json={"nome": "Estoque"}).json()["nome"]
        == "Estoque"
    )

    uid = criar_usuario("Zé", "ze@x.com", papeis=("Estoque",))
    assert c.delete(f"{API}/papeis/{pid}", headers=h).json()["erro"]["codigo"] == "papel_em_uso"
    c.delete(f"{API}/usuarios/{uid}", headers=h)  # usuário excluído não segura o papel
    assert c.delete(f"{API}/papeis/{pid}", headers=h).status_code == 204
    assert pid not in [p["id"] for p in c.get(f"{API}/papeis", headers=h).json()]
    assert auditoria(ambiente, acao="DELETE", modulo="papeis", recurso_id=str(pid))


def test_nao_concede_permissao_que_nao_possui(ambiente):
    criar_papel("Delegado", ["papeis.listar", "papeis.criar", "papeis.editar", "usuarios.listar"])
    criar_usuario("Del", "del@x.com", papeis=("Delegado",))
    c = ambiente.cliente()
    h = login(c, "del@x.com", "OutraSenha#2026")

    r = c.post(
        f"{API}/papeis",
        headers=h,
        json={"nome": "Escalada", "permissoes": ["usuarios.listar", "auditoria.listar"]},
    )
    assert r.status_code == 403 and r.json()["erro"]["codigo"] == "permissao_acima_da_sua"
    ok = c.post(
        f"{API}/papeis", headers=h, json={"nome": "Permitido", "permissoes": ["usuarios.listar"]}
    )
    assert ok.status_code == 201
    r = c.put(
        f"{API}/papeis/{ok.json()['id']}/permissoes",
        headers=h,
        json={"permissoes": ["configuracoes.editar"]},
    )
    assert r.status_code == 403


def test_sincronizacao_e_idempotente_e_respeita_ajustes_manuais(ambiente):
    sm = get_sessionmaker()
    with sm() as db:
        antes = db.scalar(select(Permissao.id).limit(1))
        gerente = db.scalar(select(Papel).where(Papel.nome == "Gerente"))
        gerente.permissoes = [p for p in gerente.permissoes if p.codigo != "auditoria.listar"]
        db.commit()
    with sm() as db:
        rbac.sincronizar(db)
        rbac.sincronizar(db)
    with sm() as db:
        gerente = db.scalar(select(Papel).where(Papel.nome == "Gerente"))
        assert "auditoria.listar" not in {p.codigo for p in gerente.permissoes}  # ajuste mantido
        assert db.scalar(select(Permissao.id).limit(1)) == antes
        assert len(list(db.scalars(select(Permissao)))) == len(PERMISSOES)
        admin = db.scalar(select(Papel).where(Papel.nome == "Administrador"))
        assert len(admin.permissoes) == len(PERMISSOES)


def test_sincronizacao_devolve_ao_admin_permissao_que_faltar(ambiente):
    sm = get_sessionmaker()
    with sm() as db:
        admin = db.scalar(select(Papel).where(Papel.nome == "Administrador"))
        admin.permissoes = admin.permissoes[:3]
        db.commit()
        rbac.sincronizar(db)
    with sm() as db:
        admin = db.scalar(select(Papel).where(Papel.nome == "Administrador"))
        assert len(admin.permissoes) == len(PERMISSOES)
