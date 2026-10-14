from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import Select, and_, func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.money import quantizar_dinheiro
from app.core.tempo import fuso_da_empresa
from app.modules.cash import service as caixa_service
from app.modules.cash.models import Caixa, CaixaConferencia, FormaPagamento, MovimentoCaixa
from app.modules.catalog.models import (
    CategoriaProduto,
    Produto,
    ProdutoComposicao,
    UnidadeMedida,
)
from app.modules.finance.models import TituloReceber
from app.modules.inventory.models import EstoqueSaldo, MovimentoEstoque
from app.modules.people.models import Pessoa
from app.modules.reports.schemas import (
    CaixaAbertoOut,
    ContasReceberResumoOut,
    DashboardOut,
    DiferencaPorForma,
    EstoqueBaixoOut,
    FaturamentoPeriodoOut,
    JanelaOut,
    LinhaCaixa,
    LinhaCompras,
    LinhaEstoque,
    LinhaPerdas,
    LinhaProdutos,
    LinhaVendas,
    MaisVendidoOut,
    PorFormaOut,
    ProdutoSemVendaOut,
    RelatorioCaixaOut,
    RelatorioComprasOut,
    RelatorioComprasResumo,
    RelatorioEstoqueOut,
    RelatorioPerdasOut,
    RelatorioProdutosOut,
    RelatorioProdutosResumo,
    RelatorioVendasOut,
    RelatorioVendasResumo,
)
from app.modules.sales.models import Venda, VendaEstorno, VendaItem, VendaPagamento
from app.modules.users.models import Usuario

LIMITE_DIAS = 366


# --- janelas de tempo no fuso da empresa -------------------------------------------------------


def fuso(db: Session) -> ZoneInfo:
    return fuso_da_empresa(db)


def hoje(tz: ZoneInfo) -> date:
    return datetime.now(tz).date()


def limites_utc(de: date, ate: date, tz: ZoneInfo) -> tuple[datetime, datetime]:
    """[início do dia `de`, início do dia seguinte a `ate`) no fuso da empresa, em UTC."""
    inicio = datetime.combine(de, time.min, tzinfo=tz).astimezone(UTC)
    fim = datetime.combine(ate + timedelta(days=1), time.min, tzinfo=tz).astimezone(UTC)
    return inicio, fim


def validar_janela(de: date | None, ate: date | None, tz: ZoneInfo) -> tuple[date, date]:
    h = hoje(tz)
    ate = ate or h
    de = de or ate.replace(day=1)
    if de > ate:
        raise AppError(422, "periodo_invalido", "A data inicial é maior que a final.")
    if (ate - de).days >= LIMITE_DIAS:
        raise AppError(422, "periodo_invalido", f"O período máximo é de {LIMITE_DIAS} dias.")
    return de, ate


def janela_do_periodo(periodo: str, ref: date) -> tuple[date, date]:
    if periodo == "dia":
        return ref, ref
    if periodo == "semana":  # segunda a domingo
        inicio = ref - timedelta(days=ref.weekday())
        return inicio, inicio + timedelta(days=6)
    inicio = ref.replace(day=1)
    proximo = (inicio.replace(day=28) + timedelta(days=4)).replace(day=1)
    return inicio, proximo - timedelta(days=1)


# --- vendas válidas ----------------------------------------------------------------------------


def _vendas_validas(inicio: datetime, fim: datetime) -> list:
    return [
        Venda.created_at >= inicio,
        Venda.created_at < fim,
        ~Venda.id.in_(select(VendaEstorno.venda_id)),
    ]


def _faturamento(db: Session, inicio: datetime, fim: datetime) -> tuple[Decimal, int]:
    total, qtd = db.execute(
        select(func.coalesce(func.sum(Venda.total), 0), func.count()).where(
            *_vendas_validas(inicio, fim)
        )
    ).one()
    return total, qtd


def _ticket(total: Decimal, qtd: int) -> Decimal:
    return quantizar_dinheiro(total / qtd) if qtd else Decimal("0.00")


def _periodo(db: Session, periodo: str, ref: date, tz: ZoneInfo) -> FaturamentoPeriodoOut:
    de, ate = janela_do_periodo(periodo, ref)
    total, qtd = _faturamento(db, *limites_utc(de, ate, tz))
    return FaturamentoPeriodoOut(
        janela=JanelaOut(de=de, ate=ate),
        faturamento=total,
        vendas_qtd=qtd,
        ticket_medio=_ticket(total, qtd),
    )


def _por_forma(db: Session, inicio: datetime, fim: datetime) -> list[PorFormaOut]:
    linhas = db.execute(
        select(FormaPagamento, func.sum(VendaPagamento.valor), func.count())
        .join(VendaPagamento, VendaPagamento.forma_pagamento_id == FormaPagamento.id)
        .join(Venda, Venda.id == VendaPagamento.venda_id)
        .where(*_vendas_validas(inicio, fim))
        .group_by(FormaPagamento.id)
        .order_by(func.sum(VendaPagamento.valor).desc(), FormaPagamento.id)
    ).all()
    return [
        PorFormaOut(
            forma_pagamento_id=f.id, forma=f.nome, tipo=f.tipo, total=total, pagamentos_qtd=qtd
        )
        for f, total, qtd in linhas
    ]


def _mais_vendidos(
    db: Session, inicio: datetime, fim: datetime, limite: int
) -> list[MaisVendidoOut]:
    linhas = db.execute(
        select(
            VendaItem.produto_id,
            func.max(VendaItem.descricao),
            func.sum(VendaItem.quantidade),
            func.sum(VendaItem.total),
        )
        .join(Venda, Venda.id == VendaItem.venda_id)
        .where(*_vendas_validas(inicio, fim))
        .group_by(VendaItem.produto_id)
        .order_by(
            func.sum(VendaItem.quantidade).desc(),
            func.sum(VendaItem.total).desc(),
            VendaItem.produto_id,
        )
        .limit(limite)
    ).all()
    return [MaisVendidoOut(produto_id=p, produto=n, quantidade=q, total=t) for p, n, q, t in linhas]


# --- dashboard ---------------------------------------------------------------------------------


def dashboard(db: Session, referencia: date | None, periodo: str) -> DashboardOut:
    tz = fuso(db)
    ref = referencia or hoje(tz)
    de, ate = janela_do_periodo(periodo, ref)
    inicio, fim = limites_utc(de, ate, tz)

    caixas = []
    for c in db.scalars(
        select(Caixa).where(Caixa.status == "aberto", Caixa.deleted_at.is_(None)).order_by(Caixa.id)
    ):
        esperado = [
            PorFormaOut(
                forma_pagamento_id=s.forma_pagamento_id,
                forma=s.forma,
                tipo=s.tipo,
                total=s.esperado,
                pagamentos_qtd=0,
            )
            for s in caixa_service.esperado_por_forma(db, c.id)
        ]
        caixas.append(
            CaixaAbertoOut(
                caixa_id=c.id, operador=c.operador.nome, aberto_em=c.aberto_em, esperado=esperado
            )
        )

    saldo = func.coalesce(EstoqueSaldo.quantidade, 0)
    abaixo = (
        select(Produto, saldo.label("saldo"))
        .outerjoin(EstoqueSaldo, EstoqueSaldo.produto_id == Produto.id)
        .where(
            Produto.deleted_at.is_(None),
            Produto.ativo.is_(True),
            Produto.controla_estoque.is_(True),
            Produto.estoque_minimo > 0,
            saldo <= Produto.estoque_minimo,
        )
    )
    baixo_qtd = db.scalar(select(func.count()).select_from(abaixo.subquery())) or 0
    baixo = db.execute(
        abaixo.order_by((saldo / Produto.estoque_minimo), Produto.nome).limit(10)
    ).all()

    a_receber, titulos = db.execute(
        select(
            func.coalesce(func.sum(TituloReceber.valor_original - TituloReceber.valor_pago), 0),
            func.count(),
        ).where(TituloReceber.status == "aberto", TituloReceber.deleted_at.is_(None))
    ).one()

    return DashboardOut(
        data_referencia=ref,
        timezone=str(tz),
        dia=_periodo(db, "dia", ref, tz),
        semana=_periodo(db, "semana", ref, tz),
        mes=_periodo(db, "mes", ref, tz),
        periodo_detalhe=periodo,  # type: ignore[arg-type]
        mais_vendidos=_mais_vendidos(db, inicio, fim, 5),
        formas_pagamento=_por_forma(db, inicio, fim),
        caixas_abertos=caixas,
        estoque_baixo_qtd=baixo_qtd,
        estoque_baixo=[
            EstoqueBaixoOut(
                produto_id=p.id,
                produto=p.nome,
                unidade=p.unidade.sigla,
                saldo=s,
                estoque_minimo=p.estoque_minimo,
            )
            for p, s in baixo
        ],
        contas_a_receber=ContasReceberResumoOut(titulos_abertos=titulos, saldo_aberto=a_receber),
    )


# --- relatório de vendas -----------------------------------------------------------------------


def relatorio_vendas(
    db: Session, de: date | None, ate: date | None, agrupar: str
) -> RelatorioVendasOut:
    tz = fuso(db)
    de, ate = validar_janela(de, ate, tz)
    inicio, fim = limites_utc(de, ate, tz)
    validas = _vendas_validas(inicio, fim)

    r = db.execute(
        select(
            func.coalesce(func.sum(Venda.total), 0),
            func.count(),
            func.coalesce(func.sum(Venda.subtotal), 0),
            func.coalesce(func.sum(Venda.desconto_total), 0),
            func.coalesce(func.sum(Venda.acrescimo_total), 0),
            func.coalesce(func.sum(Venda.taxa_servico), 0),
        ).where(*validas)
    ).one()
    estornos = db.execute(
        select(func.count(), func.coalesce(func.sum(Venda.total), 0)).where(
            Venda.created_at >= inicio,
            Venda.created_at < fim,
            Venda.id.in_(select(VendaEstorno.venda_id)),
        )
    ).one()
    resumo = RelatorioVendasResumo(
        faturamento=r[0],
        vendas_qtd=r[1],
        ticket_medio=_ticket(r[0], r[1]),
        subtotal_itens=r[2],
        descontos=r[3],
        acrescimos=r[4],
        taxa_servico=r[5],
        estornos_qtd=estornos[0],
        estornos_total=estornos[1],
    )

    linhas: list[LinhaVendas] = []
    if agrupar == "dia":
        dia = func.date(func.timezone(str(tz), Venda.created_at))
        for d, qtd, total in db.execute(
            select(dia, func.count(), func.sum(Venda.total))
            .where(*validas)
            .group_by(dia)
            .order_by(dia)
        ):
            linhas.append(
                LinhaVendas(
                    chave=d.isoformat(),
                    rotulo=d.strftime("%d/%m/%Y"),
                    vendas_qtd=qtd,
                    quantidade=None,
                    total=total,
                )
            )
    elif agrupar == "forma_pagamento":
        for f in _por_forma(db, inicio, fim):
            linhas.append(
                LinhaVendas(
                    chave=str(f.forma_pagamento_id),
                    rotulo=f.forma,
                    vendas_qtd=f.pagamentos_qtd,
                    quantidade=None,
                    total=f.total,
                )
            )
    elif agrupar == "produto":
        for p in db.execute(
            select(
                VendaItem.produto_id,
                func.max(VendaItem.descricao),
                func.count(func.distinct(VendaItem.venda_id)),
                func.sum(VendaItem.quantidade),
                func.sum(VendaItem.total),
            )
            .join(Venda, Venda.id == VendaItem.venda_id)
            .where(*validas)
            .group_by(VendaItem.produto_id)
            .order_by(func.sum(VendaItem.total).desc(), VendaItem.produto_id)
        ):
            linhas.append(
                LinhaVendas(
                    chave=str(p[0]), rotulo=p[1], vendas_qtd=p[2], quantidade=p[3], total=p[4]
                )
            )
    else:  # operador
        for u in db.execute(
            select(Usuario.id, Usuario.nome, func.count(), func.sum(Venda.total))
            .join(Venda, Venda.created_by == Usuario.id)
            .where(*validas)
            .group_by(Usuario.id)
            .order_by(func.sum(Venda.total).desc(), Usuario.id)
        ):
            linhas.append(
                LinhaVendas(
                    chave=str(u[0]), rotulo=u[1], vendas_qtd=u[2], quantidade=None, total=u[3]
                )
            )
    return RelatorioVendasOut(
        janela=JanelaOut(de=de, ate=ate), agrupado_por=agrupar, resumo=resumo, linhas=linhas
    )


# --- relatório de caixa ------------------------------------------------------------------------


def relatorio_caixa(
    db: Session, de: date | None, ate: date | None, operador_id: int | None
) -> RelatorioCaixaOut:
    tz = fuso(db)
    de, ate = validar_janela(de, ate, tz)
    inicio, fim = limites_utc(de, ate, tz)
    q: Select = select(Caixa).where(
        Caixa.deleted_at.is_(None), Caixa.aberto_em >= inicio, Caixa.aberto_em < fim
    )
    if operador_id is not None:
        q = q.where(Caixa.operador_id == operador_id)
    caixas = list(db.scalars(q.order_by(Caixa.id)))
    ids = [c.id for c in caixas]

    # Agregados de todos os caixas da janela em poucas consultas (não uma por caixa).
    esperado: dict[int, Decimal] = {}
    por_tipo: dict[tuple[int, str], Decimal] = {}
    vendas: dict[int, tuple[int, Decimal]] = {}
    conferencias: dict[int, list] = {}
    if ids:
        for caixa_id, tipo, total in db.execute(
            select(MovimentoCaixa.caixa_id, MovimentoCaixa.tipo, func.sum(MovimentoCaixa.valor))
            .where(MovimentoCaixa.caixa_id.in_(ids))
            .group_by(MovimentoCaixa.caixa_id, MovimentoCaixa.tipo)
        ):
            por_tipo[(caixa_id, tipo)] = total
            esperado[caixa_id] = esperado.get(caixa_id, Decimal(0)) + total
        for caixa_id, qtd, total in db.execute(
            select(Venda.caixa_id, func.count(), func.coalesce(func.sum(Venda.total), 0))
            .where(Venda.caixa_id.in_(ids))
            .group_by(Venda.caixa_id)
        ):
            vendas[caixa_id] = (qtd, total)
        for conf, forma in db.execute(
            select(CaixaConferencia, FormaPagamento.nome)
            .join(Caixa, Caixa.id == CaixaConferencia.caixa_id)
            .join(FormaPagamento, FormaPagamento.id == CaixaConferencia.forma_pagamento_id)
            .where(
                CaixaConferencia.caixa_id.in_(ids),
                CaixaConferencia.rodada == Caixa.rodada,
                Caixa.status == "fechado",
            )
            .order_by(CaixaConferencia.id)
        ):
            conferencias.setdefault(conf.caixa_id, []).append((conf, forma))

    linhas: list[LinhaCaixa] = []
    diferenca_total = Decimal(0)
    por_forma: dict[int, DiferencaPorForma] = {}
    for c in caixas:
        diferenca = None
        if c.status == "fechado":
            diferenca = sum((conf.diferenca for conf, _ in conferencias.get(c.id, [])), Decimal(0))
            diferenca_total += diferenca
            for conf, forma in conferencias.get(c.id, []):
                acc = por_forma.get(conf.forma_pagamento_id)
                if acc is None:
                    por_forma[conf.forma_pagamento_id] = DiferencaPorForma(
                        forma_pagamento_id=conf.forma_pagamento_id,
                        forma=forma,
                        esperado=conf.valor_esperado,
                        contado=conf.valor_contado,
                        diferenca=conf.diferenca,
                    )
                else:
                    acc.esperado += conf.valor_esperado
                    acc.contado += conf.valor_contado
                    acc.diferenca += conf.diferenca
        qtd, total_vendas = vendas.get(c.id, (0, Decimal(0)))
        linhas.append(
            LinhaCaixa(
                caixa_id=c.id,
                operador=c.operador.nome,
                status=c.status,
                aberto_em=c.aberto_em,
                fechado_em=c.fechado_em,
                valor_abertura=c.valor_abertura,
                vendas_qtd=qtd,
                vendas_total=total_vendas,
                estornos_total=-(
                    por_tipo.get((c.id, "estorno_venda"), Decimal(0))
                    + por_tipo.get((c.id, "estorno_recebimento"), Decimal(0))
                ),
                sangrias=-por_tipo.get((c.id, "sangria"), Decimal(0)),
                reforcos=por_tipo.get((c.id, "reforco"), Decimal(0)),
                esperado_total=esperado.get(c.id, Decimal(0)),
                diferenca_total=diferenca,
            )
        )
    return RelatorioCaixaOut(
        janela=JanelaOut(de=de, ate=ate),
        caixas=linhas,
        caixas_qtd=len(linhas),
        diferenca_total=diferenca_total,
        por_forma=list(por_forma.values()),
    )


# --- relatório de estoque ----------------------------------------------------------------------


def relatorio_estoque(
    db: Session, categoria_id: int | None, tipo: str | None, abaixo_minimo: bool | None
) -> RelatorioEstoqueOut:
    saldo = func.coalesce(EstoqueSaldo.quantidade, 0)
    q = (
        select(Produto, saldo.label("saldo"), CategoriaProduto.nome)
        .outerjoin(EstoqueSaldo, EstoqueSaldo.produto_id == Produto.id)
        .outerjoin(CategoriaProduto, CategoriaProduto.id == Produto.categoria_id)
        .where(Produto.deleted_at.is_(None), Produto.controla_estoque.is_(True))
    )
    if categoria_id is not None:
        q = q.where(Produto.categoria_id == categoria_id)
    if tipo:
        q = q.where(Produto.tipo == tipo)
    if abaixo_minimo:
        q = q.where(Produto.estoque_minimo > 0, saldo <= Produto.estoque_minimo)
    linhas: list[LinhaEstoque] = []
    total = Decimal(0)
    for p, s, categoria in db.execute(q.order_by(func.lower(Produto.nome), Produto.id)).all():
        valor = quantizar_dinheiro(s * p.custo_medio)
        total += valor
        linhas.append(
            LinhaEstoque(
                produto_id=p.id,
                produto=p.nome,
                tipo=p.tipo,
                categoria=categoria,
                unidade=p.unidade.sigla,
                saldo=s,
                estoque_minimo=p.estoque_minimo,
                abaixo_minimo=bool(p.estoque_minimo > 0 and s <= p.estoque_minimo),
                custo_medio=p.custo_medio,
                valor_em_estoque=valor,
            )
        )
    return RelatorioEstoqueOut(
        linhas=linhas,
        produtos_qtd=len(linhas),
        abaixo_minimo_qtd=sum(1 for x in linhas if x.abaixo_minimo),
        valor_total_em_estoque=total,
    )


# --- relatório de perdas -----------------------------------------------------------------------


def relatorio_perdas(db: Session, de: date | None, ate: date | None) -> RelatorioPerdasOut:
    tz = fuso(db)
    de, ate = validar_janela(de, ate, tz)
    inicio, fim = limites_utc(de, ate, tz)
    linhas: list[LinhaPerdas] = []
    custo_total = Decimal(0)
    ocorrencias = 0
    consulta = (
        select(
            Produto,
            func.sum(-MovimentoEstoque.quantidade),
            func.count(),
            func.sum(
                -MovimentoEstoque.quantidade
                * func.coalesce(MovimentoEstoque.custo_unitario, Produto.custo_medio)
            ),
        )
        .join(Produto, Produto.id == MovimentoEstoque.produto_id)
        .where(
            MovimentoEstoque.tipo == "perda",
            MovimentoEstoque.ocorrido_em >= inicio,
            MovimentoEstoque.ocorrido_em < fim,
        )
        .group_by(Produto.id)
        .order_by(
            func.sum(
                -MovimentoEstoque.quantidade
                * func.coalesce(MovimentoEstoque.custo_unitario, Produto.custo_medio)
            ).desc(),
            Produto.id,
        )
    )
    for p, qtd, n, custo in db.execute(consulta):
        custo = quantizar_dinheiro(custo)
        custo_total += custo
        ocorrencias += n
        linhas.append(
            LinhaPerdas(
                produto_id=p.id,
                produto=p.nome,
                unidade=p.unidade.sigla,
                quantidade=qtd,
                custo_estimado=custo,
                ocorrencias=n,
            )
        )
    return RelatorioPerdasOut(
        janela=JanelaOut(de=de, ate=ate),
        linhas=linhas,
        custo_total=custo_total,
        ocorrencias=ocorrencias,
    )


# --- relatório de compras ----------------------------------------------------------------------


def relatorio_compras(
    db: Session,
    de: date | None,
    ate: date | None,
    fornecedor_id: int | None,
    agrupar: str,
) -> RelatorioComprasOut:
    """Compra = movimento de estoque do tipo `entrada` no período. O valor de cada entrada é
    quantidade × custo unitário congelado no movimento, arredondado a centavos na própria entrada:
    assim o total e as linhas (de qualquer agrupamento) sempre fecham ao centavo. Entrada sem custo
    informado vale 0 e é contada em `entradas_sem_custo`."""
    tz = fuso(db)
    de, ate = validar_janela(de, ate, tz)
    inicio, fim = limites_utc(de, ate, tz)
    m = MovimentoEstoque
    filtros = [m.tipo == "entrada", m.ocorrido_em >= inicio, m.ocorrido_em < fim]
    if fornecedor_id is not None:
        filtros.append(m.fornecedor_id == fornecedor_id)
    valor = func.round(m.quantidade * func.coalesce(m.custo_unitario, 0), 2)
    sem_custo = m.custo_unitario.is_(None)

    # Totais numa consulta própria: não dependem do agrupamento escolhido.
    total, entradas, itens, sem = db.execute(
        select(
            func.coalesce(func.sum(valor), 0),
            func.count(),
            func.count(func.distinct(m.produto_id)),
            func.count().filter(sem_custo),
        ).where(*filtros)
    ).one()

    soma, n_sem = func.sum(valor), func.count().filter(sem_custo)
    linhas: list[LinhaCompras] = []
    if agrupar == "dia":
        dia = func.date(func.timezone(str(tz), m.ocorrido_em))
        for d, n, v, s in db.execute(
            select(dia, func.count(), soma, n_sem).where(*filtros).group_by(dia).order_by(dia)
        ):
            linhas.append(
                LinhaCompras(
                    chave=d.isoformat(),
                    rotulo=d.strftime("%d/%m/%Y"),
                    entradas_qtd=n,
                    quantidade=None,
                    unidade=None,
                    valor=v,
                    entradas_sem_custo=s,
                )
            )
    elif agrupar == "fornecedor":
        for fid, nome, n, v, s in db.execute(
            select(m.fornecedor_id, Pessoa.nome, func.count(), soma, n_sem)
            .outerjoin(Pessoa, Pessoa.id == m.fornecedor_id)
            .where(*filtros)
            .group_by(m.fornecedor_id, Pessoa.nome)
            .order_by(soma.desc(), m.fornecedor_id.nulls_last())
        ):
            linhas.append(
                LinhaCompras(
                    chave="sem_fornecedor" if fid is None else str(fid),
                    rotulo=nome if fid is not None else "Sem fornecedor",
                    entradas_qtd=n,
                    quantidade=None,
                    unidade=None,
                    valor=v,
                    entradas_sem_custo=s,
                )
            )
    elif agrupar == "produto":
        for pid, nome, sigla, n, qtd, v, s in db.execute(
            select(
                Produto.id,
                Produto.nome,
                UnidadeMedida.sigla,
                func.count(),
                func.sum(m.quantidade),
                soma,
                n_sem,
            )
            .select_from(m)
            .join(Produto, Produto.id == m.produto_id)
            .join(UnidadeMedida, UnidadeMedida.id == Produto.unidade_id)
            .where(*filtros)
            .group_by(Produto.id, Produto.nome, UnidadeMedida.sigla)
            .order_by(soma.desc(), Produto.id)
        ):
            linhas.append(
                LinhaCompras(
                    chave=str(pid),
                    rotulo=nome,
                    entradas_qtd=n,
                    quantidade=qtd,
                    unidade=sigla,
                    valor=v,
                    entradas_sem_custo=s,
                )
            )
    else:  # categoria do produto
        for cid, nome, n, v, s in db.execute(
            select(Produto.categoria_id, CategoriaProduto.nome, func.count(), soma, n_sem)
            .select_from(m)
            .join(Produto, Produto.id == m.produto_id)
            .outerjoin(CategoriaProduto, CategoriaProduto.id == Produto.categoria_id)
            .where(*filtros)
            .group_by(Produto.categoria_id, CategoriaProduto.nome)
            .order_by(soma.desc(), Produto.categoria_id.nulls_last())
        ):
            linhas.append(
                LinhaCompras(
                    chave="sem_categoria" if cid is None else str(cid),
                    rotulo=nome if cid is not None else "Sem categoria",
                    entradas_qtd=n,
                    quantidade=None,
                    unidade=None,
                    valor=v,
                    entradas_sem_custo=s,
                )
            )
    return RelatorioComprasOut(
        janela=JanelaOut(de=de, ate=ate),
        agrupado_por=agrupar,  # type: ignore[arg-type]
        resumo=RelatorioComprasResumo(
            valor_total=total,
            quantidade_entradas=entradas,
            itens=itens,
            entradas_sem_custo=sem,
        ),
        linhas=linhas,
    )


# --- relatório de produtos ---------------------------------------------------------------------

# Curva ABC: classe A enquanto o acumulado ANTES do produto for menor que 80% da receita, B até
# 95%, C o resto. Quem cruza o limite continua na classe que estava preenchendo: o produto mais
# vendido é sempre A, mesmo que sozinho passe de 80%.
_CORTE_A = Decimal(80)
_CORTE_B = Decimal(95)


def _curva(antes: Decimal, total: Decimal) -> str:
    if total <= 0:
        return "C"
    if antes * 100 < _CORTE_A * total:
        return "A"
    if antes * 100 < _CORTE_B * total:
        return "B"
    return "C"


def _pct(parte: Decimal, total: Decimal) -> Decimal | None:
    return quantizar_dinheiro(parte * 100 / total) if total else None


def _custos_das_vendas(db: Session, validas: list, filtros_produto: list) -> dict[int, Decimal]:
    """Custo (sem arredondar) por produto vendido, a partir do custo congelado no movimento de
    estoque de cada venda. A venda não guarda custo; o movimento é um por produto de estoque e
    venda (`origem_tipo='venda'`, `origem_id=venda.id`).
    - produto sem ficha técnica: quantidade vendida × custo do movimento do próprio produto;
    - produto com ficha: Σ quantidade × quantidade do insumo na ficha × custo do movimento do
      insumo (a ficha usada é a vigente hoje; o custo é o da hora da venda).
    Produto sem ficha e sem controle de estoque não tem movimento: fica sem custo."""
    m = MovimentoEstoque

    def movimento_de(produto_col):
        return and_(
            m.tipo == "venda",
            m.origem_tipo == "venda",
            m.origem_id == Venda.id,
            m.produto_id == produto_col,
        )

    base = (
        select(VendaItem.produto_id)
        .select_from(VendaItem)
        .join(Venda, Venda.id == VendaItem.venda_id)
        .join(Produto, Produto.id == VendaItem.produto_id)
        .where(*validas, *filtros_produto)
        .group_by(VendaItem.produto_id)
    )
    tem_ficha = (
        select(ProdutoComposicao.id)
        .where(ProdutoComposicao.produto_id == VendaItem.produto_id)
        .exists()
    )
    custos: dict[int, Decimal] = {}
    for produto_id, custo in db.execute(
        base.add_columns(func.sum(VendaItem.quantidade * m.custo_unitario))
        .join(m, movimento_de(VendaItem.produto_id))
        .where(~tem_ficha)
    ):
        custos[produto_id] = custo
    for produto_id, custo in db.execute(
        base.add_columns(
            func.sum(VendaItem.quantidade * ProdutoComposicao.quantidade * m.custo_unitario)
        )
        .join(ProdutoComposicao, ProdutoComposicao.produto_id == VendaItem.produto_id)
        .join(m, movimento_de(ProdutoComposicao.insumo_id))
    ):
        custos[produto_id] = custo
    return custos


def relatorio_produtos(
    db: Session,
    de: date | None,
    ate: date | None,
    categoria_id: int | None,
    tipo: str | None,
    ordenar: str,
    limite: int,
) -> RelatorioProdutosOut:
    tz = fuso(db)
    de, ate = validar_janela(de, ate, tz)
    inicio, fim = limites_utc(de, ate, tz)
    validas = _vendas_validas(inicio, fim)  # mesma regra do relatório de vendas
    filtros_produto = []
    if categoria_id is not None:
        filtros_produto.append(Produto.categoria_id == categoria_id)
    if tipo:
        filtros_produto.append(Produto.tipo == tipo)

    vendidos = db.execute(
        select(
            Produto.id,
            Produto.nome,
            Produto.tipo,
            CategoriaProduto.nome,
            UnidadeMedida.sigla,
            func.sum(VendaItem.quantidade),
            func.sum(VendaItem.total),
        )
        .select_from(VendaItem)
        .join(Venda, Venda.id == VendaItem.venda_id)
        .join(Produto, Produto.id == VendaItem.produto_id)
        .join(UnidadeMedida, UnidadeMedida.id == Produto.unidade_id)
        .outerjoin(CategoriaProduto, CategoriaProduto.id == Produto.categoria_id)
        .where(*validas, *filtros_produto)
        .group_by(
            Produto.id, Produto.nome, Produto.tipo, CategoriaProduto.nome, UnidadeMedida.sigla
        )
    ).all()
    custos = _custos_das_vendas(db, validas, filtros_produto)

    # Curva ABC e participação sobre TODOS os produtos vendidos, antes de ordenar e limitar.
    linhas: list[LinhaProdutos] = []
    receita_total = sum((v[6] for v in vendidos), Decimal(0))
    acumulado = Decimal(0)
    for pid, nome, tp, categoria, sigla, qtd, receita in sorted(
        vendidos, key=lambda v: (-v[6], -v[5], v[0])
    ):
        custo = quantizar_dinheiro(custos.get(pid, Decimal(0)))
        margem = receita - custo
        curva = _curva(acumulado, receita_total)
        acumulado += receita
        linhas.append(
            LinhaProdutos(
                produto_id=pid,
                produto=nome,
                tipo=tp,
                categoria=categoria,
                unidade=sigla,
                quantidade=qtd,
                receita=receita,
                custo=custo,
                margem=margem,
                margem_pct=_pct(margem, receita),
                participacao_pct=_pct(receita, receita_total) or Decimal("0.00"),
                acumulado_pct=_pct(acumulado, receita_total) or Decimal("0.00"),
                curva=curva,  # type: ignore[arg-type]
                sem_custo=custo == 0,
            )
        )
    custo_total = sum((x.custo for x in linhas), Decimal(0))
    margem_total = receita_total - custo_total

    if ordenar == "quantidade":
        linhas.sort(key=lambda x: (-x.quantidade, -x.receita, x.produto_id))
    elif ordenar == "margem":
        linhas.sort(key=lambda x: (-x.margem, -x.receita, x.produto_id))
    # receita: já está nessa ordem (é a da curva)

    vendeu = (
        select(VendaItem.id)
        .select_from(VendaItem)
        .join(Venda, Venda.id == VendaItem.venda_id)
        .where(VendaItem.produto_id == Produto.id, *validas)
        .exists()
    )
    sem_venda = [
        ProdutoSemVendaOut(
            produto_id=p_id,
            produto=nome,
            tipo=tp,
            categoria=categoria,
            unidade=sigla,
            saldo=(saldo or Decimal(0)) if controla else None,
        )
        for p_id, nome, tp, categoria, sigla, controla, saldo in db.execute(
            select(
                Produto.id,
                Produto.nome,
                Produto.tipo,
                CategoriaProduto.nome,
                UnidadeMedida.sigla,
                Produto.controla_estoque,
                EstoqueSaldo.quantidade,
            )
            .join(UnidadeMedida, UnidadeMedida.id == Produto.unidade_id)
            .outerjoin(CategoriaProduto, CategoriaProduto.id == Produto.categoria_id)
            .outerjoin(EstoqueSaldo, EstoqueSaldo.produto_id == Produto.id)
            .where(
                Produto.deleted_at.is_(None),
                Produto.ativo.is_(True),
                Produto.vendavel.is_(True),
                ~vendeu,
                *filtros_produto,
            )
            .order_by(func.lower(Produto.nome), Produto.id)
        )
    ]
    return RelatorioProdutosOut(
        janela=JanelaOut(de=de, ate=ate),
        ordenado_por=ordenar,  # type: ignore[arg-type]
        resumo=RelatorioProdutosResumo(
            receita_total=receita_total,
            custo_total=custo_total,
            margem_total=margem_total,
            margem_pct_total=_pct(margem_total, receita_total),
            produtos_vendidos=len(linhas),
            produtos_sem_custo=sum(1 for x in linhas if x.sem_custo),
            sem_venda_qtd=len(sem_venda),
        ),
        linhas=linhas[:limite],
        sem_venda=sem_venda,
    )
