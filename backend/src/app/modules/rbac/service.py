from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.rbac.catalog import (
    ADMINISTRADOR,
    LIMITE_DESCONTO_PADRAO,
    PAPEIS_PADRAO,
    PERMISSOES,
)
from app.modules.rbac.models import Papel, Permissao


def sincronizar(db: Session) -> None:
    """Idempotente: cria permissões e papéis de sistema que faltam. Faz commit."""
    existentes = {p.codigo: p for p in db.scalars(select(Permissao))}
    novas: set[str] = set()
    for perm in PERMISSOES:
        modulo = perm.codigo.split(".", 1)[0]
        atual = existentes.get(perm.codigo)
        if atual is None:
            atual = Permissao(codigo=perm.codigo, modulo=modulo, descricao=perm.descricao)
            db.add(atual)
            existentes[perm.codigo] = atual
            novas.add(perm.codigo)
        elif atual.descricao != perm.descricao or atual.modulo != modulo:
            atual.descricao, atual.modulo = perm.descricao, modulo

    papeis = {p.nome: p for p in db.scalars(select(Papel).where(Papel.deleted_at.is_(None)))}
    for nome, (descricao, padrao) in PAPEIS_PADRAO.items():
        papel = papeis.get(nome)
        if papel is None:
            papel = Papel(
                nome=nome,
                descricao=descricao,
                sistema=True,
                limite_desconto_pct=LIMITE_DESCONTO_PADRAO.get(nome, 0),
            )
            db.add(papel)
            conceder = set(padrao)
        elif nome == ADMINISTRADOR:
            conceder = set(padrao)  # administrador sempre tem tudo
        else:
            conceder = set(padrao) & novas
        tem = {p.codigo for p in papel.permissoes}
        for codigo in sorted(conceder - tem):
            papel.permissoes.append(existentes[codigo])
    db.commit()
