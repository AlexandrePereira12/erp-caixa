from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthContext, exigir_permissao
from app.core.pagination import Page, Paginacao
from app.modules.people import service
from app.modules.people.schemas import PessoaEditarIn, PessoaIn, PessoaOut, PessoaRapidaIn

router = APIRouter(prefix="/pessoas", tags=["pessoas"])


def _saida(p, auth: AuthContext) -> PessoaOut:  # noqa: ANN001
    out = PessoaOut.model_validate(p)
    if not service.pode_ver_documento(auth):
        out.documento = service.mascarar_documento(out.documento)
    return out


@router.get("", response_model=Page[PessoaOut])
def listar(
    q: str | None = Query(default=None, max_length=100),
    papel: Literal["cliente", "fornecedor", "colaborador"] | None = None,
    ativo: bool | None = None,
    pag: Paginacao = Depends(),
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("pessoas.listar")),
) -> Page[PessoaOut]:
    itens, total = service.listar(db, pag, q, papel, ativo, service.pode_ver_documento(auth))
    return Page(
        itens=[_saida(p, auth) for p in itens],
        total=total,
        limite=pag.limite,
        deslocamento=pag.deslocamento,
    )


@router.post("", response_model=PessoaOut, status_code=201)
def criar(
    dados: PessoaIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("pessoas.criar")),
) -> PessoaOut:
    return _saida(service.criar(db, auth, dados), auth)


@router.post("/rapido", response_model=PessoaOut, status_code=201)
def criar_rapido(
    dados: PessoaRapidaIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("pessoas.cadastro_rapido")),
) -> PessoaOut:
    return _saida(service.criar_rapido(db, dados), auth)


@router.get("/{pessoa_id}", response_model=PessoaOut)
def obter(
    pessoa_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("pessoas.listar")),
) -> PessoaOut:
    return _saida(service.obter(db, pessoa_id), auth)


@router.patch("/{pessoa_id}", response_model=PessoaOut)
def editar(
    pessoa_id: int,
    dados: PessoaEditarIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("pessoas.editar")),
) -> PessoaOut:
    return _saida(service.editar(db, auth, pessoa_id, dados), auth)


@router.delete("/{pessoa_id}", status_code=204)
def excluir(
    pessoa_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("pessoas.excluir")),
) -> Response:
    service.excluir(db, auth, pessoa_id)
    return Response(status_code=204)
