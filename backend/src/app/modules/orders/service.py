from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import Acao, registrar, snapshot
from app.core.deps import AuthContext
from app.core.errors import AppError, conflito, nao_encontrado, proibido
from app.core.money import quantizar_dinheiro
from app.core.pagination import Paginacao
from app.core.tempo import para_utc
from app.modules.catalog.models import Produto
from app.modules.catalog.service import validar_casas
from app.modules.config.models import ConfiguracaoEmpresa
from app.modules.orders.calculo import (
    DescontoExcedeConsumo,
    Totais,
    calcular,
    dividir_em_partes,
    total_item,
    valor_do_ajuste,
)
from app.modules.orders.models import Comanda, ComandaAjuste, ComandaEvento, ComandaItem
from app.modules.orders.schemas import (
    AjusteIn,
    AjusteOut,
    ComandaAbrirIn,
    ComandaEditarIn,
    ComandaOut,
    ComandaResumoOut,
    DivisaoOut,
    ItemEditarIn,
    ItemIn,
    ItemOut,
    MesaResumo,
    PessoaResumo,
    TotaisOut,
)
from app.modules.people.models import Pessoa
from app.modules.tables import service as mesas
from app.modules.tables.models import Mesa

EM_ANDAMENTO = ("aberta", "aguardando_pagamento")


# --- leitura / montagem -----------------------------------------------------------------------


def itens_ativos(c: Comanda) -> list[ComandaItem]:
    return [i for i in c.itens if i.status == "ativo"]


def ajustes_ativos(c: Comanda) -> list[ComandaAjuste]:
    return [a for a in c.ajustes if a.removido_em is None]


def totais_da_comanda(c: Comanda) -> Totais:
    try:
        return calcular(
            [(i.quantidade, i.preco_unitario) for i in itens_ativos(c)],
            [(a.tipo, a.modo, a.valor) for a in ajustes_ativos(c)],
            c.taxa_servico_pct,
        )
    except DescontoExcedeConsumo as exc:
        raise AppError(
            422,
            "desconto_excede_consumo",
            "Os descontos superam o valor consumido. Remova ou reduza um desconto.",
        ) from exc


def _id_venda(db: Session, comanda_id: int) -> int | None:
    from app.modules.sales.models import Venda

    return db.scalar(select(Venda.id).where(Venda.comanda_id == comanda_id))


def montar(db: Session, c: Comanda) -> ComandaOut:
    subtotal = sum(
        (total_item(i.quantidade, i.preco_unitario) for i in itens_ativos(c)), Decimal(0)
    )
    try:
        t = totais_da_comanda(c)
    except AppError:
        # Exibir é sempre possível: se houver desconto inconsistente, mostra sem totais finais.
        t = Totais(subtotal, Decimal(0), Decimal(0), Decimal(0), subtotal)
    return ComandaOut(
        id=c.id,
        tipo=c.tipo,
        status=c.status,
        mesa=MesaResumo(id=c.mesa.id, nome=c.mesa.nome) if c.mesa else None,
        cliente=PessoaResumo(id=c.cliente.id, nome=c.cliente.nome) if c.cliente else None,
        nome_cliente=c.nome_cliente,
        endereco_entrega=c.endereco_entrega,
        num_pessoas=c.num_pessoas,
        observacao=c.observacao,
        taxa_servico_pct=c.taxa_servico_pct,
        aberta_em=c.created_at,
        fechada_em=c.fechada_em,
        cancelada_motivo=c.cancelada_motivo,
        itens=[
            ItemOut(
                id=i.id,
                produto_id=i.produto_id,
                descricao=i.descricao,
                quantidade=i.quantidade,
                preco_unitario=i.preco_unitario,
                total=total_item(i.quantidade, i.preco_unitario),
                observacao=i.observacao,
                status=i.status,
                cancelado_motivo=i.cancelado_motivo,
                lancado_em=i.created_at,
                lancado_por=i.created_by,
            )
            for i in c.itens
        ],
        ajustes=[
            AjusteOut(
                id=a.id,
                tipo=a.tipo,
                modo=a.modo,
                valor=a.valor,
                valor_calculado=valor_do_ajuste(a.modo, a.valor, subtotal),
                justificativa=a.justificativa,
                criado_por=a.created_by,
                removido=a.removido_em is not None,
            )
            for a in c.ajustes
        ],
        totais=TotaisOut(
            subtotal=t.subtotal,
            desconto=t.desconto,
            acrescimo=t.acrescimo,
            taxa_servico=t.taxa_servico,
            total=t.total,
        ),
        venda_id=_id_venda(db, c.id) if c.status == "fechada" else None,
    )


def obter(db: Session, comanda_id: int, travar: bool = False) -> Comanda:
    q = select(Comanda).where(Comanda.id == comanda_id, Comanda.deleted_at.is_(None))
    if travar:
        # Trava só a linha da comanda (os joins de mesa/cliente ficam de fora do FOR UPDATE).
        q = q.with_for_update(of=Comanda).execution_options(populate_existing=True)
    c = db.scalar(q)
    if c is None:
        raise nao_encontrado("Comanda")
    return c


def obter_saida(db: Session, comanda_id: int) -> ComandaOut:
    return montar(db, obter(db, comanda_id))


def listar(
    db: Session,
    pag: Paginacao,
    status: str | None,
    tipo: str | None,
    mesa_id: int | None,
    cliente_id: int | None,
    de: datetime | None,
    ate: datetime | None,
    q: str | None,
) -> tuple[list[ComandaResumoOut], int]:
    de, ate = para_utc(db, de), para_utc(db, ate)
    filtros = [Comanda.deleted_at.is_(None)]
    if status:
        filtros.append(Comanda.status == status)
    if tipo:
        filtros.append(Comanda.tipo == tipo)
    if mesa_id is not None:
        filtros.append(Comanda.mesa_id == mesa_id)
    if cliente_id is not None:
        filtros.append(Comanda.cliente_id == cliente_id)
    if de is not None:
        filtros.append(Comanda.created_at >= de)
    if ate is not None:
        filtros.append(Comanda.created_at < ate)
    if q and q.strip():
        termo = q.strip()
        cond = Comanda.nome_cliente.ilike(f"%{termo}%")
        if termo.isdigit():
            cond = cond | (Comanda.id == int(termo))
        filtros.append(cond)
    total = db.scalar(select(func.count()).select_from(Comanda).where(*filtros)) or 0
    comandas = db.scalars(
        select(Comanda)
        .where(*filtros)
        .order_by(Comanda.id.desc())
        .limit(pag.limite)
        .offset(pag.deslocamento)
    )
    saida = []
    for c in comandas:
        try:
            tot = totais_da_comanda(c).total
        except AppError:
            tot = sum(
                (total_item(i.quantidade, i.preco_unitario) for i in itens_ativos(c)), Decimal(0)
            )
        saida.append(
            ComandaResumoOut(
                id=c.id,
                tipo=c.tipo,
                status=c.status,
                mesa=MesaResumo(id=c.mesa.id, nome=c.mesa.nome) if c.mesa else None,
                cliente=PessoaResumo(id=c.cliente.id, nome=c.cliente.nome) if c.cliente else None,
                nome_cliente=c.nome_cliente,
                aberta_em=c.created_at,
                fechada_em=c.fechada_em,
                itens_ativos=len(itens_ativos(c)),
                total=tot,
            )
        )
    return saida, total


# --- escrita -----------------------------------------------------------------------------------


def evento(
    db: Session, c: Comanda, tipo: str, descricao: str, dados: dict[str, Any] | None = None
) -> None:
    db.add(ComandaEvento(comanda_id=c.id, tipo=tipo, descricao=descricao, dados=dados))


def _estado(c: Comanda) -> dict[str, Any]:
    return {
        **snapshot(c),
        "itens": [snapshot(i, excluir={"id", "comanda_id"}) for i in c.itens],
        "ajustes": [snapshot(a, excluir={"id", "comanda_id"}) for a in c.ajustes],
    }


def sincronizar_mesa(c: Comanda, mesa: Mesa | None) -> None:
    """A mesa acompanha o estado da comanda."""
    if mesa is None:
        return
    mesa.status = {"aberta": "ocupada", "aguardando_pagamento": "aguardando_pagamento"}.get(
        c.status, "livre"
    )


def _cliente(db: Session, cliente_id: int) -> Pessoa:
    p = db.get(Pessoa, cliente_id)
    if p is None or p.deleted_at is not None or not p.ativo:
        raise AppError(422, "cliente_invalido", "Cliente não encontrado ou inativo.")
    return p


def abrir(db: Session, dados: ComandaAbrirIn) -> ComandaOut:
    mesa = None
    taxa = Decimal(0)
    if dados.tipo == "mesa":
        if dados.mesa_id is None:
            raise AppError(422, "mesa_obrigatoria", "Informe a mesa.")
        mesa = mesas.obter_mesa(db, dados.mesa_id, travar=True)
        if not mesa.ativa:
            raise conflito("mesa_inativa", "A mesa está inativa.")
        if mesa.status not in ("livre", "reservada"):
            raise conflito(
                "mesa_indisponivel", f"A mesa {mesa.nome} está {mesa.status.replace('_', ' ')}."
            )
        taxa = db.get_one(ConfiguracaoEmpresa, 1).taxa_servico_pct
    elif dados.mesa_id is not None:
        raise AppError(422, "mesa_invalida", "Só comanda do tipo 'mesa' usa mesa.")
    if dados.cliente_id is not None:
        _cliente(db, dados.cliente_id)
    if dados.tipo == "delivery" and not (dados.endereco_entrega or "").strip():
        raise AppError(422, "endereco_obrigatorio", "Informe o endereço de entrega.")

    c = Comanda(
        tipo=dados.tipo,
        mesa_id=dados.mesa_id,
        cliente_id=dados.cliente_id,
        nome_cliente=dados.nome_cliente,
        endereco_entrega=dados.endereco_entrega,
        num_pessoas=dados.num_pessoas,
        observacao=dados.observacao,
        status="aberta",
        taxa_servico_pct=taxa,
    )
    db.add(c)
    db.flush()  # o índice único parcial recusa a 2ª comanda em andamento na mesma mesa
    sincronizar_mesa(c, mesa)
    evento(db, c, "aberta", f"Comanda aberta ({dados.tipo}).")
    registrar(
        db,
        Acao.CREATE,
        "comandas",
        "comanda",
        c.id,
        f"Comanda #{c.id} aberta ({c.tipo}).",
        depois=snapshot(c),
    )
    db.commit()
    db.refresh(c)
    return montar(db, c)


def _exigir_aberta(c: Comanda, aceitar_aguardando: bool = False) -> None:
    permitidos = EM_ANDAMENTO if aceitar_aguardando else ("aberta",)
    if c.status not in permitidos:
        raise conflito(
            "comanda_nao_aberta",
            f"A comanda #{c.id} está {c.status.replace('_', ' ')}"
            + (
                " e não aceita alterações."
                if c.status != "aguardando_pagamento"
                else ": reabra para alterar os itens."
            ),
        )


def editar(db: Session, comanda_id: int, dados: ComandaEditarIn) -> ComandaOut:
    c = obter(db, comanda_id, travar=True)
    _exigir_aberta(c, aceitar_aguardando=True)
    antes = _estado(c)
    enviados = dados.model_fields_set
    if "cliente_id" in enviados:
        if dados.cliente_id is not None:
            _cliente(db, dados.cliente_id)
        c.cliente_id = dados.cliente_id
    for campo in ("nome_cliente", "endereco_entrega", "num_pessoas", "observacao"):
        if campo in enviados:
            setattr(c, campo, getattr(dados, campo))
    db.flush()
    db.refresh(c)
    registrar(
        db,
        Acao.UPDATE,
        "comandas",
        "comanda",
        c.id,
        f"Comanda #{c.id} atualizada.",
        antes=antes,
        depois=_estado(c),
    )
    db.commit()
    return montar(db, c)


def lancar_item(db: Session, comanda_id: int, dados: ItemIn) -> ComandaOut:
    c = obter(db, comanda_id, travar=True)
    _exigir_aberta(c)
    p = db.get(Produto, dados.produto_id)
    if p is None or p.deleted_at is not None:
        raise nao_encontrado("Produto")
    if not p.ativo or not p.vendavel:
        raise AppError(422, "produto_indisponivel", f"{p.nome} não está disponível para venda.")
    validar_casas(dados.quantidade, p.unidade)
    item = ComandaItem(
        produto_id=p.id,
        descricao=p.nome,
        quantidade=dados.quantidade,
        preco_unitario=p.preco_venda,
        observacao=dados.observacao,
        status="ativo",
    )
    c.itens.append(item)
    db.flush()
    evento(
        db,
        c,
        "item_lancado",
        f"{dados.quantidade:f} x {p.nome}",
        {
            "item_id": item.id,
            "produto_id": p.id,
            "quantidade": f"{dados.quantidade:f}",
            "preco": f"{p.preco_venda:f}",
        },
    )
    registrar(
        db,
        Acao.CREATE,
        "comandas",
        "comanda_item",
        item.id,
        f"Comanda #{c.id}: {dados.quantidade:f} x {p.nome} a {p.preco_venda:f}.",
        depois=snapshot(item),
    )
    db.commit()
    db.refresh(c)
    return montar(db, c)


def _item(c: Comanda, item_id: int) -> ComandaItem:
    item = next((i for i in c.itens if i.id == item_id), None)
    if item is None:
        raise nao_encontrado("Item da comanda")
    return item


def editar_item(db: Session, comanda_id: int, item_id: int, dados: ItemEditarIn) -> ComandaOut:
    c = obter(db, comanda_id, travar=True)
    _exigir_aberta(c)
    item = _item(c, item_id)
    if item.status != "ativo":
        raise conflito("item_cancelado", "O item está cancelado.")
    antes = snapshot(item)
    if dados.quantidade is not None:
        if dados.quantidade < item.quantidade:
            raise AppError(
                422,
                "reducao_de_quantidade",
                "Para reduzir a quantidade, cancele o item (com motivo) e lance de novo.",
            )
        validar_casas(dados.quantidade, item.produto.unidade)
        item.quantidade = dados.quantidade
    if "observacao" in dados.model_fields_set:
        item.observacao = dados.observacao
    db.flush()
    evento(db, c, "item_editado", f"Item {item.descricao} editado.", {"item_id": item.id})
    registrar(
        db,
        Acao.UPDATE,
        "comandas",
        "comanda_item",
        item.id,
        f"Comanda #{c.id}: item {item.descricao} editado.",
        antes=antes,
        depois=snapshot(item),
    )
    db.commit()
    db.refresh(c)
    return montar(db, c)


def _janela_cancelamento(db: Session) -> timedelta:
    return timedelta(minutes=db.get_one(ConfiguracaoEmpresa, 1).cancelamento_janela_min)


def _desconto_efetivo_pct(c: Comanda, descontar_item: ComandaItem | None = None) -> Decimal:
    """Desconto total como % do subtotal dos itens ativos (opcionalmente sem `descontar_item`):
    soma dos percentuais declarados + dos valores fixos sobre o subtotal. Subtotal zero com desconto
    em valor vira infinito (indefinido)."""
    itens = [i for i in itens_ativos(c) if i is not descontar_item]
    subtotal = sum((total_item(i.quantidade, i.preco_unitario) for i in itens), Decimal(0))
    pct = Decimal(0)
    for a in ajustes_ativos(c):
        if a.tipo != "desconto":
            continue
        if a.modo == "percentual":
            pct += a.valor
        elif subtotal > 0:
            pct += a.valor * 100 / subtotal
        else:
            return Decimal("Infinity")
    return pct


def cancelar_item(
    db: Session, auth: AuthContext, comanda_id: int, item_id: int, motivo: str
) -> ComandaOut:
    c = obter(db, comanda_id, travar=True)
    _exigir_aberta(c)
    item = _item(c, item_id)
    if item.status != "ativo":
        raise conflito("item_cancelado", "O item já está cancelado.")

    pode = "comandas.cancelar_item" in auth.permissoes
    if not pode and "comandas.cancelar_item_proprio" in auth.permissoes:
        no_prazo = datetime.now(UTC) - item.created_at <= _janela_cancelamento(db)
        pode = item.created_by == auth.usuario.id and no_prazo
    if not pode:
        raise proibido(
            "cancelamento_exige_gerente",
            "Este item só pode ser cancelado por um gerente (prazo para cancelar o próprio lançamento esgotado ou item de outra pessoa).",
        )
    # Cancelar item reduz o subtotal e, com desconto em valor fixo, faz o desconto efetivo crescer:
    # não pode ser um caminho para passar do limite de quem cancela.
    depois_pct = _desconto_efetivo_pct(c, descontar_item=item)
    if depois_pct > _desconto_efetivo_pct(c) and depois_pct > _limite_desconto_pct(auth):
        mostrado = (
            "mais de 100" if depois_pct.is_infinite() else f"{quantizar_dinheiro(depois_pct):f}"
        )
        raise proibido(
            "desconto_acima_do_limite",
            f"Cancelar este item levaria o desconto a {mostrado}% do consumo, acima do seu limite de "
            f"{_limite_desconto_pct(auth):f}%. Remova ou reduza o desconto antes, ou peça a um gerente.",
        )
    antes = snapshot(item)
    item.status = "cancelado"
    item.cancelado_motivo = motivo.strip()
    item.cancelado_em = datetime.now(UTC)
    item.cancelado_por = auth.usuario.id
    db.flush()
    evento(db, c, "item_cancelado", f"{item.descricao} cancelado: {motivo}", {"item_id": item.id})
    registrar(
        db,
        Acao.CANCELAMENTO,
        "comandas",
        "comanda_item",
        item.id,
        f"Comanda #{c.id}: item {item.descricao} cancelado ({motivo}).",
        antes=antes,
        depois=snapshot(item),
    )
    db.commit()
    db.refresh(c)
    return montar(db, c)


def transferir(db: Session, comanda_id: int, mesa_id: int) -> ComandaOut:
    c = obter(db, comanda_id, travar=True)
    _exigir_aberta(c, aceitar_aguardando=True)
    if c.tipo != "mesa" or c.mesa_id is None:
        raise AppError(422, "transferencia_invalida", "Só comanda de mesa pode ser transferida.")
    if c.mesa_id == mesa_id:
        raise AppError(422, "transferencia_invalida", "A comanda já está nesta mesa.")
    # Trava as duas mesas em ordem crescente de id (sem deadlock entre transferências cruzadas).
    ids = sorted({c.mesa_id, mesa_id})
    travadas = {i: mesas.obter_mesa(db, i, travar=True) for i in ids}
    origem, destino = travadas[c.mesa_id], travadas[mesa_id]
    if not destino.ativa or destino.status not in ("livre", "reservada"):
        raise conflito("mesa_indisponivel", f"A mesa {destino.nome} não está disponível.")
    antes = {"mesa_id": origem.id, "mesa": origem.nome}
    c.mesa_id = destino.id
    origem.status = "livre"
    sincronizar_mesa(c, destino)
    db.flush()
    evento(db, c, "transferida", f"Transferida da mesa {origem.nome} para {destino.nome}.")
    registrar(
        db,
        Acao.UPDATE,
        "comandas",
        "comanda",
        c.id,
        f"Comanda #{c.id} transferida: {origem.nome} → {destino.nome}.",
        antes=antes,
        depois={"mesa_id": destino.id, "mesa": destino.nome},
    )
    db.commit()
    db.refresh(c)
    return montar(db, c)


def _limite_desconto_pct(auth: AuthContext) -> Decimal:
    return max(
        (p.limite_desconto_pct for p in auth.usuario.papeis if p.deleted_at is None),
        default=Decimal(0),
    )


def aplicar_ajuste(db: Session, auth: AuthContext, comanda_id: int, dados: AjusteIn) -> ComandaOut:
    c = obter(db, comanda_id, travar=True)
    _exigir_aberta(c, aceitar_aguardando=True)
    subtotal = sum(
        (total_item(i.quantidade, i.preco_unitario) for i in itens_ativos(c)), Decimal(0)
    )
    if subtotal <= 0:
        raise AppError(422, "comanda_vazia", "Lance itens antes de aplicar desconto ou acréscimo.")
    if dados.modo == "percentual" and dados.valor > 100:
        raise AppError(422, "ajuste_invalido", "O percentual não pode passar de 100.")

    novo = ComandaAjuste(
        tipo=dados.tipo,
        modo=dados.modo,
        valor=dados.valor,
        justificativa=dados.justificativa.strip(),
    )
    if dados.tipo == "desconto":
        valor_novo = valor_do_ajuste(dados.modo, dados.valor, subtotal)
        ja_aplicado = sum(
            (
                valor_do_ajuste(a.modo, a.valor, subtotal)
                for a in ajustes_ativos(c)
                if a.tipo == "desconto"
            ),
            Decimal(0),
        )
        if ja_aplicado + valor_novo > subtotal:
            raise AppError(
                422, "desconto_excede_consumo", "Os descontos superam o valor consumido."
            )
        pct = (ja_aplicado + valor_novo) * 100 / subtotal
        limite = _limite_desconto_pct(auth)
        if pct > limite:
            raise proibido(
                "desconto_acima_do_limite",
                f"Desconto total de {quantizar_dinheiro(pct):f}% passa do seu limite de {limite:f}%. Peça a um gerente.",
            )
    c.ajustes.append(novo)
    db.flush()
    try:
        totais_da_comanda(c)
    except AppError:
        raise
    evento(
        db,
        c,
        "ajuste",
        f"{dados.tipo} de {dados.valor:f}{'%' if dados.modo == 'percentual' else ''}: {dados.justificativa}",
        {"ajuste_id": novo.id},
    )
    registrar(
        db,
        Acao.DESCONTO if dados.tipo == "desconto" else Acao.UPDATE,
        "comandas",
        "comanda_ajuste",
        novo.id,
        f"Comanda #{c.id}: {dados.tipo} de {dados.valor:f}{'%' if dados.modo == 'percentual' else ''} ({dados.justificativa}).",
        depois=snapshot(novo),
    )
    db.commit()
    db.refresh(c)
    return montar(db, c)


def remover_ajuste(db: Session, auth: AuthContext, comanda_id: int, ajuste_id: int) -> ComandaOut:
    c = obter(db, comanda_id, travar=True)
    _exigir_aberta(c, aceitar_aguardando=True)
    a = next((x for x in c.ajustes if x.id == ajuste_id and x.removido_em is None), None)
    if a is None:
        raise nao_encontrado("Ajuste")
    antes = snapshot(a)
    a.removido_em = datetime.now(UTC)
    a.removido_por = auth.usuario.id
    db.flush()
    evento(db, c, "ajuste_removido", f"{a.tipo} removido.", {"ajuste_id": a.id})
    registrar(
        db,
        Acao.UPDATE,
        "comandas",
        "comanda_ajuste",
        a.id,
        f"Comanda #{c.id}: {a.tipo} removido.",
        antes=antes,
        depois=snapshot(a),
    )
    db.commit()
    db.refresh(c)
    return montar(db, c)


def pedir_conta(db: Session, comanda_id: int) -> ComandaOut:
    c = obter(db, comanda_id, travar=True)
    _exigir_aberta(c)
    if not itens_ativos(c):
        raise AppError(422, "comanda_vazia", "A comanda não tem itens.")
    totais_da_comanda(c)
    c.status = "aguardando_pagamento"
    sincronizar_mesa(c, c.mesa)
    db.flush()
    evento(db, c, "conta_pedida", "Conta pedida: aguardando pagamento.")
    registrar(
        db,
        Acao.UPDATE,
        "comandas",
        "comanda",
        c.id,
        f"Comanda #{c.id} aguardando pagamento.",
        antes={"status": "aberta"},
        depois={"status": "aguardando_pagamento"},
    )
    db.commit()
    db.refresh(c)
    return montar(db, c)


def reabrir(db: Session, comanda_id: int) -> ComandaOut:
    c = obter(db, comanda_id, travar=True)
    if c.status != "aguardando_pagamento":
        raise conflito(
            "comanda_nao_aguardando", "Só comanda aguardando pagamento pode ser reaberta."
        )
    c.status = "aberta"
    sincronizar_mesa(c, c.mesa)
    db.flush()
    evento(db, c, "reaberta", "Comanda reaberta para alteração.")
    registrar(
        db,
        Acao.UPDATE,
        "comandas",
        "comanda",
        c.id,
        f"Comanda #{c.id} reaberta.",
        antes={"status": "aguardando_pagamento"},
        depois={"status": "aberta"},
    )
    db.commit()
    db.refresh(c)
    return montar(db, c)


def cancelar(db: Session, comanda_id: int, motivo: str) -> ComandaOut:
    c = obter(db, comanda_id, travar=True)
    if c.status not in EM_ANDAMENTO:
        raise conflito(
            "comanda_nao_aberta", f"A comanda #{c.id} está {c.status.replace('_', ' ')}."
        )
    antes = {"status": c.status}
    c.status = "cancelada"
    c.cancelada_motivo = motivo.strip()
    c.fechada_em = datetime.now(UTC)
    sincronizar_mesa(c, c.mesa)
    db.flush()
    evento(db, c, "cancelada", f"Comanda cancelada: {motivo}")
    registrar(
        db,
        Acao.CANCELAMENTO,
        "comandas",
        "comanda",
        c.id,
        f"Comanda #{c.id} cancelada ({motivo}).",
        antes=antes,
        depois={"status": "cancelada", "motivo": motivo},
    )
    db.commit()
    db.refresh(c)
    return montar(db, c)


def dividir(db: Session, comanda_id: int, pessoas: int) -> DivisaoOut:
    c = obter(db, comanda_id)
    if c.status not in EM_ANDAMENTO:
        raise conflito("comanda_nao_aberta", "Só comanda em andamento pode ser dividida.")
    total = totais_da_comanda(c).total
    return DivisaoOut(total=total, pessoas=pessoas, partes=dividir_em_partes(total, pessoas))
