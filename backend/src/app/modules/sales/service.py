from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import Acao, registrar, snapshot
from app.core.deps import AuthContext
from app.core.errors import AppError, conflito, nao_encontrado, proibido
from app.core.money import quantizar_quantidade
from app.core.pagination import Paginacao
from app.core.tempo import para_utc
from app.modules.cash import service as caixa
from app.modules.catalog.models import Produto
from app.modules.finance import service as financeiro
from app.modules.finance.models import TituloReceber
from app.modules.inventory.models import MovimentoEstoque
from app.modules.inventory.service import aplicar_movimento
from app.modules.orders import service as comandas
from app.modules.orders.calculo import total_item
from app.modules.people.models import Pessoa
from app.modules.sales.models import Venda, VendaEstorno, VendaItem, VendaPagamento
from app.modules.sales.schemas import (
    EstornoOut,
    FecharComandaIn,
    PessoaResumo,
    VendaItemOut,
    VendaOut,
    VendaPagamentoOut,
    VendaResumoOut,
)
from app.modules.users.models import Usuario

# --- leitura -----------------------------------------------------------------------------------


def montar(db: Session, v: Venda) -> VendaOut:
    operador = (
        db.scalar(select(Usuario.nome).where(Usuario.id == v.created_by)) if v.created_by else None
    )
    estorno = None
    if v.estorno is not None:
        por = (
            db.scalar(select(Usuario.nome).where(Usuario.id == v.estorno.created_by))
            if v.estorno.created_by
            else None
        )
        estorno = EstornoOut(motivo=v.estorno.motivo, em=v.estorno.created_at, por=por)
    return VendaOut(
        id=v.id,
        comanda_id=v.comanda_id,
        caixa_id=v.caixa_id,
        cliente=PessoaResumo(id=v.cliente.id, nome=v.cliente.nome) if v.cliente else None,
        operador=operador,
        subtotal=v.subtotal,
        desconto_total=v.desconto_total,
        acrescimo_total=v.acrescimo_total,
        taxa_servico=v.taxa_servico,
        total=v.total,
        troco_total=sum((p.troco or Decimal(0) for p in v.pagamentos), Decimal(0)),
        created_at=v.created_at,
        itens=[
            VendaItemOut(
                produto_id=i.produto_id,
                descricao=i.descricao,
                quantidade=i.quantidade,
                preco_unitario=i.preco_unitario,
                total=i.total,
            )
            for i in v.itens
        ],
        pagamentos=[
            VendaPagamentoOut(
                id=p.id,
                forma_pagamento_id=p.forma_pagamento_id,
                forma=p.forma_pagamento.nome,
                tipo=p.forma_pagamento.tipo,
                valor=p.valor,
                valor_recebido=p.valor_recebido,
                troco=p.troco,
                parcelas=p.parcelas,
                observacao=p.observacao,
            )
            for p in v.pagamentos
        ],
        estorno=estorno,
    )


def _venda(db: Session, venda_id: int, travar: bool = False) -> Venda:
    """`travar`: serializa pela linha da COMANDA da venda. A própria venda é append-only (a API não
    tem UPDATE nela), então `FOR UPDATE` em `venda` seria negado pelo banco."""
    v = db.scalar(select(Venda).where(Venda.id == venda_id))
    if v is not None and travar:
        comandas.obter(db, v.comanda_id, travar=True)
        db.refresh(v)  # relê depois da trava (estorno concorrente pode ter acabado de commitar)
    if v is None:
        raise nao_encontrado("Venda")
    return v


def obter_saida(db: Session, venda_id: int) -> VendaOut:
    return montar(db, _venda(db, venda_id))


def listar(
    db: Session,
    pag: Paginacao,
    de: datetime | None,
    ate: datetime | None,
    caixa_id: int | None,
    cliente_id: int | None,
    status: str,
) -> tuple[list[VendaResumoOut], int]:
    de, ate = para_utc(db, de), para_utc(db, ate)
    filtros = []
    if de is not None:
        filtros.append(Venda.created_at >= de)
    if ate is not None:
        filtros.append(Venda.created_at < ate)
    if caixa_id is not None:
        filtros.append(Venda.caixa_id == caixa_id)
    if cliente_id is not None:
        filtros.append(Venda.cliente_id == cliente_id)
    estornadas = select(VendaEstorno.venda_id)
    if status == "validas":
        filtros.append(~Venda.id.in_(estornadas))
    elif status == "estornadas":
        filtros.append(Venda.id.in_(estornadas))
    total = db.scalar(select(func.count()).select_from(Venda).where(*filtros)) or 0
    vendas = db.scalars(
        select(Venda)
        .where(*filtros)
        .order_by(Venda.id.desc())
        .limit(pag.limite)
        .offset(pag.deslocamento)
    )
    return [
        VendaResumoOut(
            id=v.id,
            comanda_id=v.comanda_id,
            caixa_id=v.caixa_id,
            cliente=PessoaResumo(id=v.cliente.id, nome=v.cliente.nome) if v.cliente else None,
            total=v.total,
            created_at=v.created_at,
            estornada=v.estorno is not None,
        )
        for v in vendas
    ], total


# --- fechamento --------------------------------------------------------------------------------


def _necessidades_de_estoque(itens) -> dict[int, Decimal]:
    """Quanto de cada produto de estoque a venda consome: o próprio item (sem ficha técnica) ou
    os insumos da ficha técnica. Agregado por produto: um único movimento por produto e venda."""
    soma: dict[int, Decimal] = defaultdict(Decimal)
    for item in itens:
        p = item.produto
        if p.composicao:
            for comp in p.composicao:
                soma[comp.insumo_id] += item.quantidade * comp.quantidade
        elif p.controla_estoque:
            soma[p.id] += item.quantidade
    return {pid: quantizar_quantidade(q) for pid, q in soma.items() if quantizar_quantidade(q) > 0}


def fechar_comanda(
    db: Session, auth: AuthContext, comanda_id: int, dados: FecharComandaIn
) -> VendaOut:
    """Venda + pagamentos + caixa + estoque + título de fiado + fechamento da comanda, em UMA
    transação. Qualquer falha desfaz tudo (nada é commitado até o último passo).

    Ordem de travas, igual em todo o sistema: comanda -> caixa (share) -> cliente (se fiado) ->
    saldos de estoque em ordem crescente de produto_id.
    Fechar duas vezes a mesma comanda: a segunda chamada espera a trava, vê a comanda fechada e
    recebe 409; `venda.comanda_id` único é a garantia final no banco.
    """
    c = comandas.obter(db, comanda_id, travar=True)
    if c.status not in comandas.EM_ANDAMENTO:
        raise conflito(
            "comanda_nao_aberta", f"A comanda #{c.id} está {c.status.replace('_', ' ')}."
        )
    ativos = comandas.itens_ativos(c)
    if not ativos:
        raise AppError(422, "comanda_vazia", "A comanda não tem itens: cancele-a em vez de fechar.")
    totais = comandas.totais_da_comanda(c)
    cx = caixa.exigir_caixa_aberto(db, auth, trava="share")

    # --- pagamentos ---
    if totais.total == 0 and dados.pagamentos:
        raise AppError(422, "pagamento_indevido", "Comanda de valor zero não recebe pagamento.")
    if totais.total > 0 and not dados.pagamentos:
        raise AppError(422, "pagamento_obrigatorio", "Informe o pagamento.")
    linhas = []
    for p in dados.pagamentos:
        forma = caixa.obter_forma(db, p.forma_pagamento_id)
        if not forma.ativa:
            raise AppError(422, "forma_inativa", f"A forma {forma.nome} está inativa.")
        if p.valor_recebido is not None:
            if forma.tipo != "dinheiro":
                raise AppError(
                    422, "valor_recebido_invalido", "Valor recebido só vale para dinheiro."
                )
            if p.valor_recebido < p.valor:
                raise AppError(
                    422, "valor_recebido_invalido", "O valor recebido é menor que o valor pago."
                )
        if p.parcelas is not None and forma.tipo != "credito":
            raise AppError(422, "parcelas_invalidas", "Parcelas só valem para cartão de crédito.")
        linhas.append((p, forma))
    informado = sum((p.valor for p, _ in linhas), Decimal(0))
    if informado != totais.total:
        raise AppError(
            422,
            "pagamento_diferente_do_total",
            f"Os pagamentos somam {informado:f} e o total da comanda é {totais.total:f}.",
            detalhes={"total": f"{totais.total:f}", "informado": f"{informado:f}"},
        )

    fiados = [(p, f) for p, f in linhas if f.tipo == "fiado"]
    cliente_id = dados.cliente_id or c.cliente_id
    cliente = None
    if cliente_id is not None:
        cliente = db.get(Pessoa, cliente_id)
        if cliente is None or cliente.deleted_at is not None or not cliente.ativo:
            raise AppError(422, "cliente_invalido", "Cliente não encontrado ou inativo.")
    if len(fiados) > 1:
        raise AppError(422, "fiado_duplicado", "Use uma única linha de pagamento em fiado.")
    if fiados:
        if "vendas.fiado" not in auth.permissoes:
            raise proibido("sem_permissao", "Você não pode receber em fiado. Chame um gerente.")
        if cliente is None:
            raise AppError(422, "fiado_sem_cliente", "Informe o cliente para vender em fiado.")
        # Trava o cliente: duas vendas fiado simultâneas não furam o limite juntas.
        db.execute(
            select(Pessoa.id)
            .where(Pessoa.id == cliente.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        db.refresh(cliente)
        if cliente.deleted_at is not None or not cliente.ativo:
            raise AppError(422, "cliente_invalido", "Cliente não encontrado ou inativo.")
        perfil = cliente.cliente
        if perfil is None or not perfil.aceita_fiado:
            raise AppError(
                422, "cliente_sem_fiado", f"{cliente.nome} não está habilitado para fiado."
            )
        valor_fiado = fiados[0][0].valor
        if perfil.limite_fiado > 0:
            em_aberto, _ = financeiro.saldo_aberto_pessoa(db, cliente.id)
            if em_aberto + valor_fiado > perfil.limite_fiado:
                raise conflito(
                    "limite_fiado_excedido",
                    f"{cliente.nome} tem {em_aberto:f} em aberto; mais {valor_fiado:f} passa do limite de {perfil.limite_fiado:f}.",
                )

    # --- venda ---
    venda = Venda(
        comanda_id=c.id,
        caixa_id=cx.id,
        cliente_id=cliente.id if cliente else None,
        subtotal=totais.subtotal,
        desconto_total=totais.desconto,
        acrescimo_total=totais.acrescimo,
        taxa_servico=totais.taxa_servico,
        total=totais.total,
    )
    for item in ativos:
        venda.itens.append(
            VendaItem(
                comanda_item_id=item.id,
                produto_id=item.produto_id,
                descricao=item.descricao,
                quantidade=item.quantidade,
                preco_unitario=item.preco_unitario,
                total=total_item(item.quantidade, item.preco_unitario),
            )
        )
    pagamentos: list[tuple[VendaPagamento, str]] = []
    for p, forma in linhas:
        troco = (p.valor_recebido - p.valor) if p.valor_recebido is not None else None
        vp = VendaPagamento(
            forma_pagamento_id=forma.id,
            valor=p.valor,
            valor_recebido=p.valor_recebido,
            troco=troco,
            parcelas=p.parcelas,
            observacao=p.observacao,
        )
        venda.pagamentos.append(vp)
        pagamentos.append((vp, forma.tipo))
    db.add(venda)
    db.flush()  # UNIQUE (comanda_id): última barreira contra venda duplicada

    # --- caixa ---
    for vp, tipo in pagamentos:
        if tipo == "fiado":
            continue  # fiado não entra no caixa: vira conta a receber
        caixa.lancar(
            db,
            cx,
            tipo="venda",
            forma=caixa.obter_forma(db, vp.forma_pagamento_id),
            valor=vp.valor,
            origem_tipo="venda_pagamento",
            origem_id=vp.id,
            descricao=f"Venda #{venda.id} (comanda #{c.id})",
        )

    # --- fiado ---
    for vp, tipo in pagamentos:
        if tipo == "fiado":
            assert cliente is not None
            financeiro.criar_titulo_fiado(db, pessoa=cliente, pagamento=vp, venda=venda)

    # --- estoque ---
    necessidades = _necessidades_de_estoque(ativos)
    permitir_negativo = False
    if dados.permitir_estoque_negativo:
        if "estoque.permitir_negativo" not in auth.permissoes:
            raise proibido("sem_permissao", "Você não pode autorizar estoque negativo.")
        if not (dados.justificativa_estoque or "").strip():
            raise AppError(
                422, "justificativa_obrigatoria", "Informe a justificativa do estoque negativo."
            )
        permitir_negativo = True
    for produto_id in sorted(necessidades):
        produto = db.get(Produto, produto_id)
        assert produto is not None
        aplicar_movimento(
            db,
            produto=produto,
            delta=-necessidades[produto_id],
            tipo="venda",
            origem_tipo="venda",
            origem_id=venda.id,
            permitir_negativo=permitir_negativo,
            justificativa=dados.justificativa_estoque if permitir_negativo else None,
        )

    # --- comanda ---
    if cliente is not None and c.cliente_id != cliente.id:
        c.cliente_id = cliente.id
    c.status = "fechada"
    c.fechada_em = datetime.now(UTC)
    comandas.sincronizar_mesa(c, c.mesa)
    comandas.evento(
        db,
        c,
        "fechada",
        f"Comanda fechada: venda #{venda.id}, total {totais.total:f}.",
        {"venda_id": venda.id},
    )
    db.flush()

    # --- auditoria (mesma transação) ---
    registrar(
        db,
        Acao.FECHAMENTO_COMANDA,
        "vendas",
        "venda",
        venda.id,
        f"Comanda #{c.id} fechada: venda #{venda.id}, total {totais.total:f}.",
        antes={"comanda_status": "aberta"},
        depois={
            "venda_id": venda.id,
            "total": totais.total,
            "caixa_id": cx.id,
            "pagamentos": [
                {"forma_pagamento_id": vp.forma_pagamento_id, "valor": vp.valor}
                for vp, _ in pagamentos
            ],
            "estoque": {str(k): v for k, v in necessidades.items()},
        },
    )
    for vp, tipo in pagamentos:
        registrar(
            db,
            Acao.PAGAMENTO,
            "vendas",
            "venda_pagamento",
            vp.id,
            f"Venda #{venda.id}: pagamento de {vp.valor:f} em {tipo}.",
            depois=snapshot(vp),
        )
    db.commit()
    db.refresh(venda)
    return montar(db, venda)


# --- estorno -----------------------------------------------------------------------------------


def estornar(db: Session, auth: AuthContext, venda_id: int, motivo: str) -> VendaOut:
    """Estorno cria lançamentos inversos (caixa, estoque, título); o histórico original não muda.
    Ordem de travas: comanda da venda -> caixa de quem estorna -> títulos -> saldos de estoque
    (comanda antes do caixa como no fechamento; caixa antes do título como na baixa)."""
    v = _venda(db, venda_id, travar=True)
    if v.estorno is not None:
        raise conflito("venda_ja_estornada", f"A venda #{v.id} já foi estornada.")

    # Exclusiva (não compartilhada): a devolução em dinheiro confere o saldo da gaveta, como a sangria.
    cx = caixa.caixa_aberto_do_usuario(db, auth.usuario.id, trava="update")
    pagamentos_caixa = [p for p in v.pagamentos if p.forma_pagamento.tipo != "fiado"]
    titulos = list(
        db.scalars(
            select(TituloReceber)
            .where(TituloReceber.venda_pagamento_id.in_([p.id for p in v.pagamentos]))
            .with_for_update(of=TituloReceber)
            .execution_options(populate_existing=True)
        )
    )
    baixas_a_devolver = [
        b
        for t in titulos
        for b in t.baixas
        if b.valor > 0 and not any(x.estorno_de_id == b.id for x in t.baixas)
    ]
    if (pagamentos_caixa or baixas_a_devolver) and cx is None:
        raise conflito("caixa_fechado", "Abra o seu caixa: o estorno devolve valores por ele.")
    if cx is not None:
        em_dinheiro = sum(
            (p.valor for p in pagamentos_caixa if p.forma_pagamento.tipo == "dinheiro"), Decimal(0)
        ) + sum(
            (
                b.valor
                for b in baixas_a_devolver
                if caixa.obter_forma(db, b.forma_pagamento_id).tipo == "dinheiro"
            ),
            Decimal(0),
        )
        disponivel = caixa.saldo_dinheiro(db, cx.id)
        if em_dinheiro > disponivel:
            raise conflito(
                "saldo_dinheiro_insuficiente",
                f"O estorno devolve {em_dinheiro:f} em dinheiro e o seu caixa só tem {disponivel:f}: "
                "faça um reforço antes.",
            )

    estorno = VendaEstorno(venda_id=v.id, motivo=motivo.strip())
    db.add(estorno)
    db.flush()  # UNIQUE (venda_id)

    for p in pagamentos_caixa:
        assert cx is not None
        caixa.lancar(
            db,
            cx,
            tipo="estorno_venda",
            forma=caixa.obter_forma(db, p.forma_pagamento_id),
            valor=-p.valor,
            origem_tipo="estorno_venda_pagamento",
            origem_id=p.id,
            descricao=f"Estorno da venda #{v.id}: {motivo}",
        )
    for t in titulos:
        financeiro.estornar_titulo_da_venda(db, titulo=t, motivo=motivo, caixa_estorno=cx)

    originais = list(
        db.scalars(
            select(MovimentoEstoque)
            .where(MovimentoEstoque.origem_tipo == "venda", MovimentoEstoque.origem_id == v.id)
            .order_by(MovimentoEstoque.produto_id)
        )
    )
    for m in originais:
        produto = db.get(Produto, m.produto_id)
        assert produto is not None
        aplicar_movimento(
            db,
            produto=produto,
            delta=-m.quantidade,
            tipo="estorno_venda",
            origem_tipo="estorno_venda",
            origem_id=v.id,
            custo_unitario=m.custo_unitario,  # o custo da venda original, não o de hoje
            justificativa=f"Estorno da venda #{v.id}: {motivo}",
            permitir_negativo=True,
        )

    registrar(
        db,
        Acao.ESTORNO,
        "vendas",
        "venda",
        v.id,
        f"Venda #{v.id} estornada: {motivo}",
        antes={"estornada": False},
        depois={"estornada": True, "motivo": motivo, "total": v.total},
    )
    db.commit()
    db.refresh(v)
    return montar(db, v)
