"""Importa todos os modelos para o metadata (Alembic e testes enxergarem o conjunto)."""

from app.modules.audit.models import AuditoriaLog
from app.modules.auth.models import RefreshToken
from app.modules.cash.models import (
    Caixa,
    CaixaConferencia,
    CaixaEvento,
    FormaPagamento,
    MovimentoCaixa,
)
from app.modules.catalog.models import (
    CategoriaProduto,
    Produto,
    ProdutoComposicao,
    UnidadeMedida,
)
from app.modules.config.models import ConfiguracaoEmpresa
from app.modules.finance.models import CategoriaFinanceira, TituloReceber, TituloReceberBaixa
from app.modules.inventory.models import EstoqueSaldo, Inventario, InventarioItem, MovimentoEstoque
from app.modules.orders.models import Comanda, ComandaAjuste, ComandaEvento, ComandaItem
from app.modules.people.models import Pessoa, PessoaCliente, PessoaEndereco, PessoaPapel
from app.modules.rbac.models import Papel, Permissao, papel_permissao, usuario_papel
from app.modules.sales.models import Venda, VendaEstorno, VendaItem, VendaPagamento
from app.modules.tables.models import Mesa
from app.modules.users.models import Usuario

__all__ = [
    "AuditoriaLog",
    "Caixa",
    "CaixaConferencia",
    "CaixaEvento",
    "CategoriaFinanceira",
    "CategoriaProduto",
    "Comanda",
    "ComandaAjuste",
    "ComandaEvento",
    "ComandaItem",
    "ConfiguracaoEmpresa",
    "EstoqueSaldo",
    "FormaPagamento",
    "Inventario",
    "InventarioItem",
    "Mesa",
    "MovimentoCaixa",
    "MovimentoEstoque",
    "Papel",
    "Permissao",
    "Pessoa",
    "PessoaCliente",
    "PessoaEndereco",
    "PessoaPapel",
    "Produto",
    "ProdutoComposicao",
    "RefreshToken",
    "TituloReceber",
    "TituloReceberBaixa",
    "UnidadeMedida",
    "Usuario",
    "Venda",
    "VendaEstorno",
    "VendaItem",
    "VendaPagamento",
    "papel_permissao",
    "usuario_papel",
]
