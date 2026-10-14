import re
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.audit import Acao, registrar, snapshot
from app.core.deps import AuthContext
from app.core.documentos import normalizar_documento, somente_digitos
from app.core.errors import AppError, conflito, nao_encontrado, proibido
from app.core.pagination import Paginacao
from app.modules.people.models import Pessoa, PessoaCliente, PessoaEndereco, PessoaPapel
from app.modules.people.schemas import (
    EnderecoIn,
    PessoaEditarIn,
    PessoaIn,
    PessoaRapidaIn,
)


def pode_ver_documento(auth: AuthContext) -> bool:
    """CPF/CNPJ completo só para quem precisa dele (ver, cadastrar ou editar pessoas)."""
    return bool({"pessoas.ver_documento", "pessoas.criar", "pessoas.editar"} & auth.permissoes)


def mascarar_documento(documento: str | None) -> str | None:
    return None if documento is None else f"***{documento[-2:]}"


def _estado(p: Pessoa) -> dict[str, Any]:
    return {
        **snapshot(p),
        "papeis": sorted(p.papeis),
        "enderecos": [
            snapshot(e, excluir={"id", "pessoa_id"})
            for e in sorted(p.enderecos, key=lambda e: (not e.principal, e.id))
        ],
        "cliente": snapshot(p.cliente, excluir={"pessoa_id"}) if p.cliente else None,
    }


def _obter(db: Session, pessoa_id: int) -> Pessoa:
    p = db.get(Pessoa, pessoa_id)
    if p is None or p.deleted_at is not None:
        raise nao_encontrado("Pessoa")
    return p


def obter(db: Session, pessoa_id: int) -> Pessoa:
    return _obter(db, pessoa_id)


def _documento(valor: str | None, tipo: str) -> str | None:
    if valor is None or not valor.strip():
        return None
    try:
        return normalizar_documento(valor, tipo)
    except ValueError as exc:
        raise AppError(422, "documento_invalido", f"{exc}.") from exc


def _documento_em_uso(db: Session, documento: str, exceto_id: int | None = None) -> bool:
    q = select(Pessoa.id).where(Pessoa.documento == documento, Pessoa.deleted_at.is_(None))
    if exceto_id is not None:
        q = q.where(Pessoa.id != exceto_id)
    return db.scalar(q) is not None


def _montar_enderecos(dados: list[EnderecoIn]) -> list[PessoaEndereco]:
    enderecos = [PessoaEndereco(**e.model_dump(exclude={"principal"})) for e in dados]
    marcados = [i for i, e in enumerate(dados) if e.principal]
    if len(marcados) > 1:
        raise AppError(422, "endereco_principal_duplicado", "Só um endereço pode ser o principal.")
    principal = marcados[0] if marcados else (0 if enderecos else None)
    for i, e in enumerate(enderecos):
        e.principal = i == principal
    return enderecos


def _exigir_pode_definir_fiado(auth: AuthContext) -> None:
    if "pessoas.definir_fiado" not in auth.permissoes:
        raise proibido(
            "sem_permissao", "Você não pode alterar as condições de fiado deste cliente."
        )


def listar(
    db: Session,
    pag: Paginacao,
    q: str | None,
    papel: str | None,
    ativo: bool | None,
    buscar_documento: bool = False,
) -> tuple[list[Pessoa], int]:
    filtros = [Pessoa.deleted_at.is_(None)]
    if q and q.strip():
        termo = f"%{q.strip()}%"
        condicoes = [
            Pessoa.nome.ilike(termo),
            Pessoa.nome_fantasia.ilike(termo),
            Pessoa.email.ilike(termo),
            Pessoa.telefone.ilike(termo),
            Pessoa.whatsapp.ilike(termo),
        ]
        digitos = somente_digitos(q)
        if digitos:
            # Buscar por prefixo de CPF/CNPJ permitiria enumerar documentos: só para quem os vê.
            if buscar_documento:
                condicoes.append(Pessoa.documento.like(f"{digitos}%"))
            condicoes.append(
                func.regexp_replace(Pessoa.telefone, r"\D", "", "g").like(f"%{digitos}%")
            )
        filtros.append(or_(*condicoes))
    if papel:
        filtros.append(
            Pessoa.id.in_(select(PessoaPapel.pessoa_id).where(PessoaPapel.papel == papel))
        )
    if ativo is not None:
        filtros.append(Pessoa.ativo.is_(ativo))
    total = db.scalar(select(func.count()).select_from(Pessoa).where(*filtros)) or 0
    itens = list(
        db.scalars(
            select(Pessoa)
            .where(*filtros)
            .order_by(func.lower(Pessoa.nome), Pessoa.id)
            .limit(pag.limite)
            .offset(pag.deslocamento)
        )
    )
    return itens, total


def criar(db: Session, auth: AuthContext, dados: PessoaIn) -> Pessoa:
    documento = _documento(dados.documento, dados.tipo)
    if documento and _documento_em_uso(db, documento):
        raise conflito("documento_em_uso", "Já existe uma pessoa com este CPF/CNPJ.")
    papeis = sorted(set(dados.papeis))
    if dados.cliente is not None and "cliente" not in papeis:
        raise AppError(422, "cliente_sem_papel", "Dados de cliente exigem o papel 'cliente'.")
    if dados.cliente is not None and (dados.cliente.aceita_fiado or dados.cliente.limite_fiado):
        _exigir_pode_definir_fiado(auth)

    p = Pessoa(
        tipo=dados.tipo,
        nome=dados.nome.strip(),
        nome_fantasia=dados.nome_fantasia,
        documento=documento,
        telefone=dados.telefone,
        whatsapp=dados.whatsapp,
        email=dados.email,
        observacoes=dados.observacoes,
        ativo=dados.ativo,
    )
    p.papeis = papeis
    p.enderecos = _montar_enderecos(dados.enderecos)
    if "cliente" in papeis:
        c = dados.cliente
        p.cliente = PessoaCliente(
            aceita_fiado=c.aceita_fiado if c else False,
            limite_fiado=c.limite_fiado if c else 0,
        )
    db.add(p)
    db.flush()
    registrar(
        db,
        Acao.CREATE,
        "pessoas",
        "pessoa",
        p.id,
        f"Pessoa {p.nome} cadastrada.",
        depois=_estado(p),
    )
    db.commit()
    db.refresh(p)  # recarrega as coleções já na ordem definida no modelo
    return p


def criar_rapido(db: Session, dados: PessoaRapidaIn) -> Pessoa:
    """Cliente de balcão: só nome e telefone, sem fiado."""
    telefone = re.sub(r"[^\d+()\- ]", "", dados.telefone).strip()
    if len(somente_digitos(telefone)) < 8:
        raise AppError(422, "telefone_invalido", "Informe um telefone válido.")
    p = Pessoa(tipo="F", nome=dados.nome.strip(), telefone=telefone, ativo=True)
    p.papeis = ["cliente"]
    p.cliente = PessoaCliente(aceita_fiado=False, limite_fiado=0)
    db.add(p)
    db.flush()
    registrar(
        db,
        Acao.CREATE,
        "pessoas",
        "pessoa",
        p.id,
        f"Cliente {p.nome} cadastrado no balcão (cadastro rápido).",
        depois=_estado(p),
    )
    db.commit()
    db.refresh(p)  # recarrega as coleções já na ordem definida no modelo
    return p


def editar(db: Session, auth: AuthContext, pessoa_id: int, dados: PessoaEditarIn) -> Pessoa:
    p = _obter(db, pessoa_id)
    antes = _estado(p)
    enviados = dados.model_fields_set

    if "tipo" in enviados and dados.tipo is not None:
        p.tipo = dados.tipo
    for campo in ("nome", "nome_fantasia", "telefone", "whatsapp", "email", "observacoes"):
        if campo in enviados:
            valor = getattr(dados, campo)
            if campo == "nome" and valor is None:
                raise AppError(422, "validacao", "O nome não pode ficar vazio.")
            setattr(p, campo, valor.strip() if campo == "nome" else valor)
    if "ativo" in enviados and dados.ativo is not None:
        p.ativo = dados.ativo
    if "documento" in enviados or "tipo" in enviados:
        bruto = dados.documento if "documento" in enviados else p.documento
        p.documento = _documento(bruto, p.tipo)
        if p.documento and _documento_em_uso(db, p.documento, exceto_id=p.id):
            raise conflito("documento_em_uso", "Já existe uma pessoa com este CPF/CNPJ.")

    if "papeis" in enviados and dados.papeis is not None:
        novos = sorted(set(dados.papeis))
        p.papeis = novos
    papeis = set(p.papeis)
    if "enderecos" in enviados and dados.enderecos is not None:
        p.enderecos = _montar_enderecos(dados.enderecos)

    if "cliente" in enviados and dados.cliente is not None:
        if "cliente" not in papeis:
            raise AppError(422, "cliente_sem_papel", "Dados de cliente exigem o papel 'cliente'.")
        atual = p.cliente
        mudou_fiado = atual is None or (
            atual.aceita_fiado != dados.cliente.aceita_fiado
            or atual.limite_fiado != dados.cliente.limite_fiado
        )
        if mudou_fiado:
            _exigir_pode_definir_fiado(auth)
        if atual is None:
            p.cliente = PessoaCliente(**dados.cliente.model_dump())
        else:
            atual.aceita_fiado = dados.cliente.aceita_fiado
            atual.limite_fiado = dados.cliente.limite_fiado
    if "cliente" in papeis and p.cliente is None:
        p.cliente = PessoaCliente(aceita_fiado=False, limite_fiado=0)
    if "cliente" not in papeis and p.cliente is not None:
        p.cliente = None

    db.flush()
    registrar(
        db,
        Acao.UPDATE,
        "pessoas",
        "pessoa",
        p.id,
        f"Pessoa {p.nome} atualizada.",
        antes=antes,
        depois=_estado(p),
    )
    db.commit()
    db.refresh(p)  # recarrega as coleções já na ordem definida no modelo
    return p


def excluir(db: Session, auth: AuthContext, pessoa_id: int) -> None:
    p = _obter(db, pessoa_id)
    antes = _estado(p)
    p.deleted_at = datetime.now(UTC)
    p.deleted_by = auth.usuario.id
    registrar(db, Acao.DELETE, "pessoas", "pessoa", p.id, f"Pessoa {p.nome} excluída.", antes=antes)
    db.commit()
