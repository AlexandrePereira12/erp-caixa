from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthContext, exigir_permissao
from app.modules.catalog.schemas import TipoProduto
from app.modules.reports import service
from app.modules.reports.schemas import (
    AgrupamentoCompras,
    DashboardOut,
    OrdemProdutos,
    Periodo,
    RelatorioCaixaOut,
    RelatorioComprasOut,
    RelatorioEstoqueOut,
    RelatorioPerdasOut,
    RelatorioProdutosOut,
    RelatorioVendasOut,
)

router = APIRouter(tags=["relatorios"])


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(
    referencia: date | None = Query(
        default=None, description="Dia de referência (padrão: hoje no fuso da empresa)"
    ),
    periodo: Periodo = "mes",
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("dashboard.ver")),
) -> DashboardOut:
    return service.dashboard(db, referencia, periodo)


@router.get("/relatorios/vendas", response_model=RelatorioVendasOut)
def vendas(
    de: date | None = None,
    ate: date | None = None,
    agrupar: Literal["dia", "forma_pagamento", "produto", "operador"] = "dia",
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("relatorios.vendas")),
) -> RelatorioVendasOut:
    return service.relatorio_vendas(db, de, ate, agrupar)


@router.get("/relatorios/caixa", response_model=RelatorioCaixaOut)
def caixa(
    de: date | None = None,
    ate: date | None = None,
    operador_id: int | None = None,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("relatorios.caixa")),
) -> RelatorioCaixaOut:
    return service.relatorio_caixa(db, de, ate, operador_id)


@router.get("/relatorios/estoque", response_model=RelatorioEstoqueOut)
def estoque(
    categoria_id: int | None = None,
    tipo: TipoProduto | None = None,
    abaixo_minimo: bool | None = None,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("relatorios.estoque")),
) -> RelatorioEstoqueOut:
    return service.relatorio_estoque(db, categoria_id, tipo, abaixo_minimo)


@router.get("/relatorios/perdas", response_model=RelatorioPerdasOut)
def perdas(
    de: date | None = None,
    ate: date | None = None,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("relatorios.perdas")),
) -> RelatorioPerdasOut:
    return service.relatorio_perdas(db, de, ate)


@router.get("/relatorios/compras", response_model=RelatorioComprasOut)
def compras(
    de: date | None = None,
    ate: date | None = None,
    fornecedor_id: int | None = None,
    agrupar: AgrupamentoCompras = "dia",
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("relatorios.compras")),
) -> RelatorioComprasOut:
    return service.relatorio_compras(db, de, ate, fornecedor_id, agrupar)


@router.get("/relatorios/produtos", response_model=RelatorioProdutosOut)
def produtos(
    de: date | None = None,
    ate: date | None = None,
    categoria_id: int | None = None,
    tipo: TipoProduto | None = None,
    ordenar: OrdemProdutos = "receita",
    limite: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("relatorios.produtos")),
) -> RelatorioProdutosOut:
    return service.relatorio_produtos(db, de, ate, categoria_id, tipo, ordenar, limite)
