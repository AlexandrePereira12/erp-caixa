"""Dados de demonstração para piloto e testes ponta a ponta (`python -m app.cli seed-demo`).

Idempotente: não faz nada se a empresa já tem produtos. Usa os mesmos serviços da API, então tudo
respeita as regras de negócio e fica na auditoria (autoria "seed-demo").
"""

from datetime import timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.context import RequestContext, set_context
from app.core.deps import AuthContext
from app.core.tempo import hoje_da_empresa
from app.modules.cash.models import FormaPagamento
from app.modules.catalog import service as catalogo
from app.modules.catalog.models import Produto, UnidadeMedida
from app.modules.catalog.schemas import (
    CategoriaIn,
    ComposicaoIn,
    ComposicaoItemIn,
    ProdutoIn,
)
from app.modules.finance.models import CategoriaFinanceira
from app.modules.inventory import service as estoque
from app.modules.inventory.schemas import EntradaIn
from app.modules.payables import service as contas_pagar
from app.modules.payables.schemas import BaixaPagarIn, TituloPagarIn
from app.modules.people import service as pessoas
from app.modules.people.schemas import ClienteIn, PessoaIn
from app.modules.tables import service as mesas
from app.modules.tables.schemas import MesaIn

D = Decimal

# Contexto de autorização do seed: só precisa das permissões que o serviço de pessoas confere.
_AUTH_SEED = AuthContext(usuario=None, permissoes=frozenset({"pessoas.definir_fiado"}), papeis=[])  # type: ignore[arg-type]


def _unidade(db: Session, sigla: str) -> int:
    return db.scalar(select(UnidadeMedida.id).where(UnidadeMedida.sigla == sigla))


def semear(db: Session) -> bool:
    """Devolve False (sem alterar nada) quando já existe produto cadastrado."""
    if db.scalar(select(func.count()).select_from(Produto)):
        return False
    set_context(RequestContext(usuario_nome="seed-demo", papel="sistema", request_id="seed-demo"))

    un, kg = _unidade(db, "UN"), _unidade(db, "KG")
    cat = {
        n: catalogo.criar_categoria(db, CategoriaIn(nome=n)).id
        for n in ("Bebidas", "Lanches", "Porções", "Sobremesas", "Insumos")
    }

    def produto(nome, tipo, unidade, categoria, preco="0", custo="0", minimo="0", codigo=None):
        return catalogo.criar_produto(
            db,
            ProdutoIn(
                nome=nome,
                tipo=tipo,
                unidade_id=unidade,
                categoria_id=cat[categoria],
                preco_venda=D(preco),
                custo_inicial=D(custo),
                estoque_minimo=D(minimo),
                codigo=codigo,
            ),
        )

    refri = produto("Refrigerante lata", "revenda", un, "Bebidas", "6.00", "3.20", "24", "BEB001")
    suco = produto("Suco natural", "preparado", un, "Bebidas", "9.00", codigo="BEB002")
    agua = produto("Água mineral", "revenda", un, "Bebidas", "4.00", "1.50", "24", "BEB003")
    cerveja = produto(
        "Cerveja long neck", "revenda", un, "Bebidas", "10.00", "5.50", "24", "BEB004"
    )
    pao = produto("Pão de hambúrguer", "insumo", un, "Insumos", custo="1.20", minimo="30")
    carne = produto("Carne bovina moída", "insumo", kg, "Insumos", custo="38.00", minimo="5")
    queijo = produto("Queijo mussarela", "insumo", kg, "Insumos", custo="42.00", minimo="3")
    batata = produto("Batata", "insumo", kg, "Insumos", custo="6.50", minimo="10")
    fruta = produto("Laranja", "insumo", kg, "Insumos", custo="4.00", minimo="5")
    caixa = produto("Embalagem delivery", "embalagem", un, "Insumos", custo="0.90", minimo="30")
    hamb = produto("Hambúrguer artesanal", "preparado", un, "Lanches", "28.00", codigo="LAN001")
    x_queijo = produto("X-Queijo", "preparado", un, "Lanches", "32.00", codigo="LAN002")
    fritas = produto("Batata frita", "preparado", un, "Porções", "22.00", codigo="POR001")
    pudim = produto("Pudim", "revenda", un, "Sobremesas", "12.00", "5.00", "6", "SOB001")

    ficha = {
        suco.id: [(fruta.id, "0.4")],
        hamb.id: [(pao.id, "1"), (carne.id, "0.18")],
        x_queijo.id: [(pao.id, "1"), (carne.id, "0.18"), (queijo.id, "0.04")],
        fritas.id: [(batata.id, "0.35")],
    }
    for produto_id, itens in ficha.items():
        catalogo.definir_composicao(
            db,
            produto_id,
            ComposicaoIn(itens=[ComposicaoItemIn(insumo_id=i, quantidade=D(q)) for i, q in itens]),
        )

    # Pessoas antes das entradas: a carga inicial de estoque é compra do fornecedor de demonstração.
    pessoas.criar(
        db,
        _AUTH_SEED,
        PessoaIn(
            tipo="F",
            nome="Cliente Balcão Fiel",
            telefone="(85) 99999-0001",
            papeis=["cliente"],
            cliente=ClienteIn(aceita_fiado=True, limite_fiado=D("300")),
        ),
    )
    pessoas.criar(
        db,
        _AUTH_SEED,
        PessoaIn(tipo="F", nome="Maria Souza", telefone="(85) 98888-0002", papeis=["cliente"]),
    )
    fornecedor = pessoas.criar(
        db,
        _AUTH_SEED,
        PessoaIn(tipo="J", nome="Distribuidora Boa Mesa Ltda", papeis=["fornecedor"]),
    )

    entradas = [
        (refri, "120", "3.20"),
        (agua, "100", "1.50"),
        (cerveja, "96", "5.50"),
        (pudim, "30", "5.00"),
        (pao, "100", "1.20"),
        (carne, "25", "38.00"),
        (queijo, "8", "42.00"),
        (batata, "40", "6.50"),
        (fruta, "20", "4.00"),
        (caixa, "100", "0.90"),
    ]
    for p, qtd, custo in entradas:
        estoque.registrar_entrada(
            db,
            EntradaIn(
                produto_id=p.id,
                quantidade=D(qtd),
                custo_unitario=D(custo),
                fornecedor_id=fornecedor.id,
                documento="Carga inicial",
            ),
        )

    for i in range(1, 11):
        mesas.criar(db, MesaIn(nome=f"Mesa {i}", capacidade=4 if i <= 8 else 6))

    _contas_a_pagar(db, fornecedor.id)
    return True


def _contas_a_pagar(db: Session, fornecedor_id: int) -> None:
    """Quatro contas de exemplo (vencida, a vencer, parcialmente paga e paga) pelos serviços reais.
    Os vencimentos são relativos a hoje (fuso da empresa), então a demonstração nunca "envelhece".
    Pagamento de conta não movimenta o caixa: o caixa e o estoque do seed ficam como estão."""

    def categoria(nome: str) -> int | None:
        return db.scalar(
            select(CategoriaFinanceira.id).where(
                CategoriaFinanceira.nome == nome,
                CategoriaFinanceira.tipo == "despesa",
                CategoriaFinanceira.deleted_at.is_(None),
            )
        )

    pix = db.scalar(
        select(FormaPagamento.id).where(
            FormaPagamento.tipo == "pix", FormaPagamento.deleted_at.is_(None)
        )
    )
    hoje = hoje_da_empresa(db)

    contas_pagar.criar(
        db,
        TituloPagarIn(
            categoria_id=categoria("Aluguel"),
            descricao="Aluguel do salão",
            documento="Recibo 112",
            valor_original=D("2500.00"),
            vencimento=hoje - timedelta(days=5),
        ),
    )
    contas_pagar.criar(
        db,
        TituloPagarIn(
            categoria_id=categoria("Energia e água"),
            descricao="Conta de energia elétrica",
            valor_original=D("680.40"),
            vencimento=hoje + timedelta(days=3),
        ),
    )
    parcial = contas_pagar.criar(
        db,
        TituloPagarIn(
            pessoa_id=fornecedor_id,
            categoria_id=categoria("Mercadorias e insumos"),
            descricao="Compra de bebidas",
            documento="NF 4821",
            valor_original=D("1200.00"),
            vencimento=hoje + timedelta(days=7),
        ),
    )
    contas_pagar.baixar(
        db,
        parcial.id,
        BaixaPagarIn(valor=D("500.00"), forma_pagamento_id=pix, observacao="Entrada da compra"),
    )
    paga = contas_pagar.criar(
        db,
        TituloPagarIn(
            categoria_id=categoria("Manutenção"),
            descricao="Manutenção da coifa",
            valor_original=D("350.00"),
            vencimento=hoje - timedelta(days=2),
        ),
    )
    contas_pagar.baixar(
        db,
        paga.id,
        BaixaPagarIn(
            valor=D("350.00"), forma_pagamento_id=pix, data_pagamento=hoje - timedelta(days=3)
        ),
    )
