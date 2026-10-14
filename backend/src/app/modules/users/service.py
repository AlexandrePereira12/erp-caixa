from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.audit import Acao, registrar, snapshot
from app.core.deps import AuthContext
from app.core.errors import AppError, conflito, nao_encontrado, proibido
from app.core.pagination import Paginacao
from app.core.security import hash_senha, validar_politica_senha
from app.modules.auth.service import invalidar_tokens
from app.modules.auth.service import revogar_todos as revogar_sessoes
from app.modules.rbac.catalog import ADMINISTRADOR
from app.modules.rbac.models import Papel, usuario_papel
from app.modules.users.models import Usuario
from app.modules.users.schemas import UsuarioCriarIn, UsuarioEditarIn


def _estado(u: Usuario) -> dict:
    return {**snapshot(u, excluir={"senha_hash"}), "papeis": [p.nome for p in u.papeis]}


def _eh_admin(u: Usuario) -> bool:
    return any(p.sistema and p.nome == ADMINISTRADOR and p.deleted_at is None for p in u.papeis)


def _obter(db: Session, usuario_id: int) -> Usuario:
    u = db.get(Usuario, usuario_id)
    if u is None or u.deleted_at is not None:
        raise nao_encontrado("Usuário")
    return u


def _permissoes_do(u: Usuario) -> set[str]:
    return {perm.codigo for p in u.papeis if p.deleted_at is None for perm in p.permissoes}


def _limite_desconto_do(papeis) -> Decimal:  # noqa: ANN001
    return max((p.limite_desconto_pct for p in papeis if p.deleted_at is None), default=Decimal(0))


def _exigir_pode_gerir(auth: AuthContext, alvo: Usuario) -> None:
    """Quem age só altera usuário que não tenha mais poder do que ele próprio.

    Sem isso, um gerente redefiniria a senha de um usuário com um papel personalizado mais
    poderoso (ou de qualquer um com o papel Administrador) e entraria como ele."""
    if _eh_admin(alvo) and "usuarios.gerir_administradores" not in auth.permissoes:
        raise proibido("admin_protegido", "Apenas administradores podem alterar um administrador.")
    if not _permissoes_do(alvo) <= auth.permissoes or _limite_desconto_do(
        alvo.papeis
    ) > _limite_desconto_do(auth.usuario.papeis):
        raise proibido(
            "usuario_acima_do_seu",
            "Este usuário tem mais poder que o seu: apenas alguém com acesso igual ou maior pode alterá-lo.",
        )


def _administradores_ativos(db: Session, exceto_id: int | None = None) -> int:
    q = (
        select(func.count(func.distinct(Usuario.id)))
        .join(usuario_papel, usuario_papel.c.usuario_id == Usuario.id)
        .join(Papel, Papel.id == usuario_papel.c.papel_id)
        .where(
            Papel.sistema.is_(True),
            Papel.nome == ADMINISTRADOR,
            Papel.deleted_at.is_(None),
            Usuario.deleted_at.is_(None),
            Usuario.suspenso.is_(False),
        )
    )
    if exceto_id is not None:
        q = q.where(Usuario.id != exceto_id)
    return db.scalar(q) or 0


def _garantir_resta_administrador(db: Session, alvo: Usuario) -> None:
    """Bloqueia a ação que deixaria a empresa sem nenhum administrador ativo.

    A trava consultiva serializa quem mexe em administradores: dois administradores suspendendo
    um ao outro ao mesmo tempo contariam um ao outro como "o outro que resta"."""
    db.execute(text("SELECT pg_advisory_xact_lock(7311001)"))
    if _eh_admin(alvo) and not alvo.suspenso and _administradores_ativos(db, alvo.id) == 0:
        raise conflito(
            "ultimo_administrador", "A empresa precisa ter ao menos um administrador ativo."
        )


def _resolver_papeis(db: Session, auth: AuthContext, ids: list[int]) -> list[Papel]:
    papeis = list(
        db.scalars(select(Papel).where(Papel.id.in_(set(ids)), Papel.deleted_at.is_(None)))
    )
    if len(papeis) != len(set(ids)):
        raise AppError(422, "papel_invalido", "Um ou mais papéis informados não existem.")
    for p in papeis:
        # Ninguém concede papel com poderes que o próprio concedente não tem.
        if not {
            perm.codigo for perm in p.permissoes
        } <= auth.permissoes or p.limite_desconto_pct > _limite_desconto_do(auth.usuario.papeis):
            raise proibido(
                "papel_acima_do_seu",
                f"Você não pode atribuir o papel {p.nome}: ele excede suas permissões.",
            )
    return sorted(papeis, key=lambda p: p.nome)


def _validar_senha_temporaria(senha: str, email: str | None = None) -> None:
    erro = validar_politica_senha(senha, email)
    if erro:
        raise AppError(422, "senha_fraca", erro)


def _email_em_uso(db: Session, email: str, exceto_id: int | None = None) -> bool:
    q = select(Usuario.id).where(func.lower(Usuario.email) == email, Usuario.deleted_at.is_(None))
    if exceto_id is not None:
        q = q.where(Usuario.id != exceto_id)
    return db.scalar(q) is not None


def listar(
    db: Session, pag: Paginacao, q: str | None, suspenso: bool | None, papel_id: int | None
) -> tuple[list[Usuario], int]:
    filtro = [Usuario.deleted_at.is_(None)]
    if q:
        termo = f"%{q.strip()}%"
        filtro.append(Usuario.nome.ilike(termo) | Usuario.email.ilike(termo))
    if suspenso is not None:
        filtro.append(Usuario.suspenso.is_(suspenso))
    if papel_id is not None:
        filtro.append(
            Usuario.id.in_(
                select(usuario_papel.c.usuario_id).where(usuario_papel.c.papel_id == papel_id)
            )
        )
    total = db.scalar(select(func.count()).select_from(Usuario).where(*filtro)) or 0
    itens = list(
        db.scalars(
            select(Usuario)
            .where(*filtro)
            .order_by(Usuario.nome, Usuario.id)
            .limit(pag.limite)
            .offset(pag.deslocamento)
        )
    )
    return itens, total


def obter(db: Session, usuario_id: int) -> Usuario:
    return _obter(db, usuario_id)


def criar(db: Session, auth: AuthContext, dados: UsuarioCriarIn) -> Usuario:
    email = dados.email.strip().lower()
    if _email_em_uso(db, email):
        raise conflito("email_em_uso", "Já existe um usuário com este e-mail.")
    _validar_senha_temporaria(dados.senha_temporaria, email)
    papeis = _resolver_papeis(db, auth, dados.papeis)
    if any(p.sistema and p.nome == ADMINISTRADOR for p in papeis) and (
        "usuarios.gerir_administradores" not in auth.permissoes
    ):
        raise proibido("admin_protegido", "Apenas administradores podem criar um administrador.")

    u = Usuario(
        nome=dados.nome.strip(),
        email=email,
        senha_hash=hash_senha(dados.senha_temporaria),
        must_change_password=True,
        papeis=papeis,
    )
    db.add(u)
    db.flush()
    registrar(
        db, Acao.CREATE, "usuarios", "usuario", u.id, f"Usuário {u.nome} criado.", depois=_estado(u)
    )
    db.commit()
    return u


def editar(db: Session, auth: AuthContext, usuario_id: int, dados: UsuarioEditarIn) -> Usuario:
    u = _obter(db, usuario_id)
    _exigir_pode_gerir(auth, u)
    antes = _estado(u)
    papeis_antes = {p.nome for p in u.papeis}

    if dados.nome is not None:
        u.nome = dados.nome.strip()
    if dados.email is not None:
        email = dados.email.strip().lower()
        if _email_em_uso(db, email, exceto_id=u.id):
            raise conflito("email_em_uso", "Já existe um usuário com este e-mail.")
        u.email = email
    if dados.papeis is not None:
        novos = _resolver_papeis(db, auth, dados.papeis)
        ficara_admin = any(p.sistema and p.nome == ADMINISTRADOR for p in novos)
        if _eh_admin(u) and not ficara_admin:
            _garantir_resta_administrador(db, u)
        if (
            ficara_admin
            and not _eh_admin(u)
            and "usuarios.gerir_administradores" not in auth.permissoes
        ):
            raise proibido(
                "admin_protegido", "Apenas administradores podem criar um administrador."
            )
        u.papeis = novos
    db.flush()

    depois = _estado(u)
    registrar(
        db,
        Acao.UPDATE,
        "usuarios",
        "usuario",
        u.id,
        f"Usuário {u.nome} atualizado.",
        antes=antes,
        depois=depois,
    )
    if {p.nome for p in u.papeis} != papeis_antes:
        registrar(
            db,
            Acao.ALTERACAO_PERMISSAO,
            "usuarios",
            "usuario",
            u.id,
            f"Papéis de {u.nome} alterados.",
            antes={"papeis": sorted(papeis_antes)},
            depois={"papeis": [p.nome for p in u.papeis]},
        )
    db.commit()
    return u


def definir_suspensao(db: Session, auth: AuthContext, usuario_id: int, suspender: bool) -> Usuario:
    u = _obter(db, usuario_id)
    _exigir_pode_gerir(auth, u)
    if suspender and u.id == auth.usuario.id:
        raise conflito("acao_em_si_mesmo", "Você não pode suspender o próprio usuário.")
    if u.suspenso == suspender:
        return u
    if suspender:
        _garantir_resta_administrador(db, u)
    antes = _estado(u)
    u.suspenso = suspender
    if suspender:
        revogar_sessoes(db, u.id)
        invalidar_tokens(u)
    db.flush()
    registrar(
        db,
        Acao.UPDATE,
        "usuarios",
        "usuario",
        u.id,
        f"Usuário {u.nome} {'suspenso' if suspender else 'reativado'}.",
        antes=antes,
        depois=_estado(u),
    )
    db.commit()
    return u


def redefinir_senha(db: Session, auth: AuthContext, usuario_id: int, senha_temporaria: str) -> None:
    u = _obter(db, usuario_id)
    _exigir_pode_gerir(auth, u)
    if u.id == auth.usuario.id:
        raise conflito("acao_em_si_mesmo", "Para trocar a própria senha, use a troca de senha.")
    _validar_senha_temporaria(senha_temporaria, u.email)
    u.senha_hash = hash_senha(senha_temporaria)
    u.must_change_password = True
    u.falhas_login = 0
    u.bloqueado_ate = None
    revogar_sessoes(db, u.id)
    invalidar_tokens(u)
    registrar(
        db,
        Acao.UPDATE,
        "usuarios",
        "usuario",
        u.id,
        f"Senha de {u.nome} redefinida por administrador.",
        antes={"must_change_password": False},
        depois={"must_change_password": True},
    )
    db.commit()


def excluir(db: Session, auth: AuthContext, usuario_id: int) -> None:
    u = _obter(db, usuario_id)
    _exigir_pode_gerir(auth, u)
    if u.id == auth.usuario.id:
        raise conflito("acao_em_si_mesmo", "Você não pode excluir o próprio usuário.")
    _garantir_resta_administrador(db, u)
    antes = _estado(u)
    u.deleted_at = datetime.now(UTC)
    u.deleted_by = auth.usuario.id
    revogar_sessoes(db, u.id)
    invalidar_tokens(u)
    registrar(
        db, Acao.DELETE, "usuarios", "usuario", u.id, f"Usuário {u.nome} excluído.", antes=antes
    )
    db.commit()
