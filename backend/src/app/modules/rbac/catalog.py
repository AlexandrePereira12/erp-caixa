"""Catálogo de permissões (`modulo.acao`) e dos papéis de sistema.

Fonte da verdade no código: `sincronizar` (rodado a cada deploy) cria o que falta. Permissão nova
só é concedida automaticamente aos papéis padrão que a listam aqui, e só na primeira vez em que
aparece; ajustes manuais feitos depois pelo administrador nunca são sobrescritos.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Perm:
    codigo: str
    descricao: str


PERMISSOES: tuple[Perm, ...] = (
    Perm("usuarios.listar", "Listar e consultar usuários"),
    Perm("usuarios.criar", "Criar usuários"),
    Perm("usuarios.editar", "Editar dados e papéis de usuários"),
    Perm("usuarios.suspender", "Suspender e reativar usuários"),
    Perm("usuarios.excluir", "Excluir usuários"),
    Perm("usuarios.redefinir_senha", "Redefinir a senha de outro usuário"),
    Perm("usuarios.gerir_administradores", "Alterar usuários com papel Administrador"),
    Perm("papeis.listar", "Listar e consultar papéis"),
    Perm("papeis.criar", "Criar papéis"),
    Perm("papeis.editar", "Editar papéis e suas permissões"),
    Perm("papeis.excluir", "Excluir papéis"),
    Perm("permissoes.listar", "Listar o catálogo de permissões"),
    Perm("auditoria.listar", "Consultar a auditoria"),
    Perm("configuracoes.ver", "Ver as configurações da empresa"),
    Perm("configuracoes.editar", "Alterar as configurações da empresa"),
    Perm("pessoas.listar", "Listar e consultar clientes, fornecedores e colaboradores"),
    Perm("pessoas.criar", "Cadastrar pessoas"),
    Perm("pessoas.editar", "Editar pessoas"),
    Perm("pessoas.excluir", "Excluir pessoas"),
    Perm("pessoas.cadastro_rapido", "Cadastro rápido de cliente (nome e telefone) no balcão"),
    Perm("pessoas.definir_fiado", "Definir se o cliente aceita fiado e o limite"),
    Perm("pessoas.ver_documento", "Ver o CPF/CNPJ completo e buscar por ele"),
    Perm("catalogo.listar", "Consultar produtos, categorias e unidades"),
    Perm("catalogo.criar", "Cadastrar produtos, categorias e unidades"),
    Perm("catalogo.editar", "Editar produtos, categorias, unidades e fichas técnicas"),
    Perm("catalogo.excluir", "Excluir produtos, categorias e unidades"),
    Perm("estoque.listar", "Consultar saldos e movimentos de estoque"),
    Perm("estoque.entrada", "Registrar entradas de estoque"),
    Perm("estoque.ajustar", "Registrar ajustes, perdas e saídas manuais de estoque"),
    Perm("estoque.permitir_negativo", "Autorizar movimento que deixa o estoque negativo"),
    Perm("inventarios.listar", "Consultar inventários"),
    Perm("inventarios.criar", "Abrir e cancelar inventários"),
    Perm("inventarios.contar", "Lançar contagens de inventário"),
    Perm("inventarios.fechar", "Fechar inventário e aplicar os ajustes"),
    Perm("mesas.listar", "Ver o mapa de mesas"),
    Perm("mesas.gerenciar", "Cadastrar mesas e bloquear/reservar/liberar"),
    Perm("comandas.listar", "Consultar comandas"),
    Perm("comandas.abrir", "Abrir comandas"),
    Perm("comandas.lancar", "Lançar e editar itens em comandas abertas"),
    Perm(
        "comandas.cancelar_item_proprio", "Cancelar item que você lançou dentro da janela de tempo"
    ),
    Perm("comandas.cancelar_item", "Cancelar qualquer item de comanda aberta"),
    Perm("comandas.transferir", "Transferir comanda de mesa"),
    Perm("comandas.desconto", "Aplicar desconto (até o limite do papel) e acréscimo"),
    Perm("comandas.cancelar", "Cancelar comanda antes do pagamento"),
    Perm("comandas.fechar", "Receber o pagamento e fechar a comanda"),
    Perm("vendas.listar", "Consultar vendas"),
    Perm("vendas.fiado", "Receber venda em fiado"),
    Perm("vendas.estornar", "Estornar venda fechada"),
    Perm("caixa.operar", "Abrir, movimentar e fechar o próprio caixa"),
    Perm("caixa.listar", "Consultar o histórico de caixas de todos os operadores"),
    Perm("caixa.gerenciar_todos", "Movimentar e fechar caixa de outro operador"),
    Perm("caixa.reabrir", "Reabrir caixa fechado"),
    Perm("formas_pagamento.listar", "Consultar formas de pagamento"),
    Perm("formas_pagamento.gerenciar", "Cadastrar e alterar formas de pagamento"),
    Perm("financeiro.listar", "Consultar contas a receber e saldo de clientes"),
    Perm("financeiro.baixar", "Registrar recebimento de contas a receber"),
    Perm("financeiro.categorias", "Gerenciar categorias financeiras"),
    Perm("contas_pagar.listar", "Consultar contas a pagar e o resumo de vencimentos"),
    Perm("contas_pagar.criar", "Lançar contas a pagar"),
    Perm("contas_pagar.editar", "Editar contas a pagar"),
    Perm("contas_pagar.baixar", "Registrar pagamentos de contas a pagar"),
    Perm("contas_pagar.cancelar", "Cancelar contas a pagar e estornar pagamentos"),
    Perm("dashboard.ver", "Ver o dashboard de gestão"),
    Perm("relatorios.vendas", "Consultar o relatório de vendas"),
    Perm("relatorios.caixa", "Consultar o relatório de caixa"),
    Perm("relatorios.estoque", "Consultar o relatório de estoque"),
    Perm("relatorios.perdas", "Consultar o relatório de perdas"),
    Perm("relatorios.compras", "Consultar o relatório de compras"),
    Perm("relatorios.produtos", "Consultar o relatório de produtos (vendas, margem e curva ABC)"),
)

ADMINISTRADOR = "Administrador"
GERENTE = "Gerente"
FRENTE_LOJA = "Frente de loja"
ATENDENTE = "Atendente"

_TODAS = frozenset(p.codigo for p in PERMISSOES)

# Gerente: operação e gestão do dia a dia; não mexe em configuração crítica nem em administradores.
_FORA_DO_GERENTE = frozenset(
    {
        "usuarios.gerir_administradores",
        "usuarios.excluir",
        "papeis.criar",
        "papeis.editar",
        "papeis.excluir",
        "configuracoes.editar",
    }
)

# nome -> (descrição, permissões padrão). Fases seguintes acrescentam permissões aqui.
PAPEIS_PADRAO: dict[str, tuple[str, frozenset[str]]] = {
    ADMINISTRADOR: ("Acesso total à empresa.", _TODAS),
    GERENTE: (
        "Opera e acompanha a empresa; autoriza descontos, cancelamentos e ajustes.",
        _TODAS - _FORA_DO_GERENTE,
    ),
    FRENTE_LOJA: (
        "Caixa, mesas, comandas e recebimentos.",
        frozenset(
            {
                "pessoas.listar",
                "pessoas.cadastro_rapido",
                "catalogo.listar",
                "estoque.listar",
                "mesas.listar",
                "comandas.listar",
                "comandas.abrir",
                "comandas.lancar",
                "comandas.cancelar_item_proprio",
                "comandas.transferir",
                "comandas.desconto",
                "comandas.fechar",
                "vendas.listar",
                "caixa.operar",
                "formas_pagamento.listar",
                "financeiro.listar",
                "financeiro.baixar",
            }
        ),
    ),
    ATENDENTE: (
        "Abre mesas e comandas e lança pedidos.",
        frozenset(
            {
                "catalogo.listar",
                "pessoas.listar",
                "mesas.listar",
                "comandas.listar",
                "comandas.abrir",
                "comandas.lancar",
                "comandas.cancelar_item_proprio",
                "comandas.transferir",
            }
        ),
    ),
}

# Maior desconto (% do subtotal) que cada papel de sistema aplica sem ajuda de um gerente.
LIMITE_DESCONTO_PADRAO: dict[str, int] = {
    ADMINISTRADOR: 100,
    GERENTE: 20,
    FRENTE_LOJA: 5,
    ATENDENTE: 0,
}
