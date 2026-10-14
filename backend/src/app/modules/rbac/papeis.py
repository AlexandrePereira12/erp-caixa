from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import Acao, registrar, snapshot
from app.core.deps import AuthContext
from app.core.errors import AppError, conflito, nao_encontrado, proibido
from app.modules.rbac.catalog import ADMINISTRADOR
from app.modules.rbac.models import Papel, Permissao, usuario_papel
from app.modules.rbac.schemas import PapelCriarIn, PapelEditarIn
from app.modules.users.models import Usuario


def _estado(p: Papel) -> dict:
    return {**snapshot(p), "permissoes": sorted(x.codigo for x in p.permissoes)}


def listar_permissoes(db: Session) -> list[Permissao]:
    return list(db.scalars(select(Permissao).order_by(Permissao.modulo, Permissao.codigo)))


def listar(db: Session) -> list[Papel]:
    return list(db.scalars(select(Papel).where(Papel.deleted_at.is_(None)).order_by(Papel.nome)))


def obter(db: Session, papel_id: int) -> Papel:
    p = db.get(Papel, papel_id)
    if p is None or p.deleted_at is not None:
        raise nao_encontrado("Papel")
    return p


def _nome_em_uso(db: Session, nome: str, exceto_id: int | None = None) -> bool:
    q = select(Papel.id).where(func.lower(Papel.nome) == nome.lower(), Papel.deleted_at.is_(None))
    if exceto_id is not None:
        q = q.where(Papel.id != exceto_id)
    return db.scalar(q) is not None


def _resolver_permissoes(db: Session, codigos: list[str]) -> list[Permissao]:
    unicos = set(codigos)
    perms = list(db.scalars(select(Permissao).where(Permissao.codigo.in_(unicos))))
    if len(perms) != len(unicos):
        raise AppError(422, "permissao_invalida", "Uma ou mais permissões informadas não existem.")
    return sorted(perms, key=lambda p: p.codigo)


def _exigir_nao_conceder_acima(auth: AuthContext, novas: set[str]) -> None:
    excedente = novas - auth.permissoes
    if excedente:
        raise proibido(
            "permissao_acima_da_sua",
            "Você não pode conceder permissões que não possui: " + ", ".join(sorted(excedente)),
        )


def _exigir_limite_permitido(auth: AuthContext, limite: Decimal) -> None:
    """O limite de desconto é um privilégio: ninguém define limite maior que o seu."""
    meu = max(
        (p.limite_desconto_pct for p in auth.usuario.papeis if p.deleted_at is None),
        default=Decimal(0),
    )
    if limite > meu:
        raise proibido(
            "limite_acima_do_seu",
            f"Você não pode definir um limite de desconto ({limite:f}%) maior que o seu ({meu:f}%).",
        )


def criar(db: Session, auth: AuthContext, dados: PapelCriarIn) -> Papel:
    nome = dados.nome.strip()
    if _nome_em_uso(db, nome):
        raise conflito("papel_nome_em_uso", "Já existe um papel com este nome.")
    perms = _resolver_permissoes(db, dados.permissoes)
    _exigir_nao_conceder_acima(auth, {p.codigo for p in perms})
    _exigir_limite_permitido(auth, dados.limite_desconto_pct)
    p = Papel(
        nome=nome,
        descricao=dados.descricao,
        sistema=False,
        limite_desconto_pct=dados.limite_desconto_pct,
        permissoes=perms,
    )
    db.add(p)
    db.flush()
    registrar(
        db, Acao.CREATE, "papeis", "papel", p.id, f"Papel {p.nome} criado.", depois=_estado(p)
    )
    db.commit()
    return p


def editar(db: Session, auth: AuthContext, papel_id: int, dados: PapelEditarIn) -> Papel:
    p = obter(db, papel_id)
    antes = _estado(p)
    if dados.nome is not None and dados.nome.strip() != p.nome:
        if p.sistema:
            raise conflito("papel_protegido", "Papéis de sistema não podem ser renomeados.")
        if _nome_em_uso(db, dados.nome.strip(), exceto_id=p.id):
            raise conflito("papel_nome_em_uso", "Já existe um papel com este nome.")
        p.nome = dados.nome.strip()
    if "descricao" in dados.model_fields_set:
        p.descricao = dados.descricao
    if dados.limite_desconto_pct is not None and dados.limite_desconto_pct != p.limite_desconto_pct:
        _exigir_limite_permitido(auth, dados.limite_desconto_pct)
        p.limite_desconto_pct = dados.limite_desconto_pct
    db.flush()
    registrar(
        db,
        Acao.UPDATE,
        "papeis",
        "papel",
        p.id,
        f"Papel {p.nome} atualizado.",
        antes=antes,
        depois=_estado(p),
    )
    db.commit()
    return p


def definir_permissoes(db: Session, auth: AuthContext, papel_id: int, codigos: list[str]) -> Papel:
    p = obter(db, papel_id)
    if p.sistema and p.nome == ADMINISTRADOR:
        raise conflito(
            "papel_protegido", "O papel Administrador sempre possui todas as permissões."
        )
    novas = _resolver_permissoes(db, codigos)
    antes = {x.codigo for x in p.permissoes}
    depois = {x.codigo for x in novas}
    _exigir_nao_conceder_acima(auth, depois - antes)
    p.permissoes = novas
    db.flush()
    descricao = f"Permissões do papel {p.nome} alteradas"
    if depois - antes:
        descricao += f"; concedidas: {', '.join(sorted(depois - antes))}"
    if antes - depois:
        descricao += f"; removidas: {', '.join(sorted(antes - depois))}"
    registrar(
        db,
        Acao.ALTERACAO_PERMISSAO,
        "papeis",
        "papel",
        p.id,
        descricao + ".",
        antes={"permissoes": sorted(antes)},
        depois={"permissoes": sorted(depois)},
    )
    db.commit()
    return p


def excluir(db: Session, papel_id: int) -> None:
    p = obter(db, papel_id)
    if p.sistema:
        raise conflito("papel_protegido", "Papéis de sistema não podem ser excluídos.")
    em_uso = db.scalar(
        select(func.count())
        .select_from(usuario_papel)
        .join(Usuario, Usuario.id == usuario_papel.c.usuario_id)
        .where(usuario_papel.c.papel_id == p.id, Usuario.deleted_at.is_(None))
    )
    if em_uso:
        raise conflito("papel_em_uso", "Há usuários com este papel; troque o papel deles antes.")
    antes = _estado(p)
    p.deleted_at = datetime.now(UTC)
    registrar(db, Acao.DELETE, "papeis", "papel", p.id, f"Papel {p.nome} excluído.", antes=antes)
    db.commit()
