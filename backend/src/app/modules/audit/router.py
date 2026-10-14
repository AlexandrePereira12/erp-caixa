from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthContext, exigir_permissao
from app.core.errors import nao_encontrado
from app.core.pagination import Page, Paginacao
from app.core.tempo import para_utc
from app.modules.audit.models import AuditoriaLog
from app.modules.audit.schemas import AuditoriaOut

router = APIRouter(prefix="/auditoria", tags=["auditoria"])


@router.get("", response_model=Page[AuditoriaOut])
def listar(
    usuario_id: int | None = None,
    acao: str | None = Query(default=None, max_length=40),
    modulo: str | None = Query(default=None, max_length=40),
    recurso: str | None = Query(default=None, max_length=60),
    recurso_id: str | None = Query(default=None, max_length=60),
    request_id: str | None = Query(default=None, max_length=64),
    de: datetime | None = None,
    ate: datetime | None = None,
    pag: Paginacao = Depends(),
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("auditoria.listar")),
) -> Page[AuditoriaOut]:
    de, ate = para_utc(db, de), para_utc(db, ate)
    filtros = []
    if usuario_id is not None:
        filtros.append(AuditoriaLog.usuario_id == usuario_id)
    for coluna, valor in (
        (AuditoriaLog.acao, acao),
        (AuditoriaLog.modulo, modulo),
        (AuditoriaLog.recurso, recurso),
        (AuditoriaLog.recurso_id, recurso_id),
        (AuditoriaLog.request_id, request_id),
    ):
        if valor:
            filtros.append(coluna == valor)
    if de is not None:
        filtros.append(AuditoriaLog.ocorrido_em >= de)
    if ate is not None:
        filtros.append(AuditoriaLog.ocorrido_em < ate)

    total = db.scalar(select(func.count()).select_from(AuditoriaLog).where(*filtros)) or 0
    itens = db.scalars(
        select(AuditoriaLog)
        .where(*filtros)
        .order_by(AuditoriaLog.ocorrido_em.desc(), AuditoriaLog.id.desc())
        .limit(pag.limite)
        .offset(pag.deslocamento)
    )
    return Page(
        itens=[AuditoriaOut.model_validate(i) for i in itens],
        total=total,
        limite=pag.limite,
        deslocamento=pag.deslocamento,
    )


@router.get("/{auditoria_id}", response_model=AuditoriaOut)
def obter(
    auditoria_id: int,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("auditoria.listar")),
) -> AuditoriaOut:
    item = db.get(AuditoriaLog, auditoria_id)
    if item is None:
        raise nao_encontrado("Registro de auditoria")
    return AuditoriaOut.model_validate(item)
