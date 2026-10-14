import type { ComponentType, SVGProps } from "react";
import { ChartIcon, CogIcon, HomeIcon, ListIcon, PayableIcon, ShieldIcon, UsersIcon } from "@/components/icons";
import { BoxIcon, ClipboardCheckIcon, ContactsIcon, StockIcon } from "@/components/icons-cadastros";
import { ArchiveIcon, BagIcon, CardIcon, CashIcon, ReceiptIcon, TableIcon, UtensilsIcon, WalletIcon } from "@/components/pdv/icons";
import type { Permission } from "@/lib/auth/permissions";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export interface NavItem {
  to: string;
  label: string;
  icon: Icon;
  /** Permissão de listar/ver do submódulo; sem ela o link não aparece. */
  permission?: Permission;
  end?: boolean;
  /** Frase curta que acompanha o atalho na página inicial. */
  hint?: string;
  /** Nome acessível, quando o rótulo se repete em outro módulo (ex.: "Vendas" e "Relatório de vendas"). */
  ariaLabel?: string;
}

/** Módulo do menu: agrupa submódulos (itens) que compartilham o assunto. */
export interface NavModule {
  id: string;
  label: string;
  icon: Icon;
  /** Aberto no primeiro acesso (os módulos do dia a dia); depois vale o que a pessoa escolher. */
  defaultOpen?: boolean;
  items: NavItem[];
}

export const HOME_ITEM: NavItem = { to: "/", label: "Início", icon: HomeIcon, end: true };

export const NAV_MODULES: NavModule[] = [
  {
    id: "atendimento",
    label: "Atendimento",
    icon: UtensilsIcon,
    defaultOpen: true,
    items: [
      { to: "/mesas", label: "Salão", icon: TableIcon, permission: "mesas.listar", hint: "Mapa das mesas e abertura de comandas" },
      { to: "/comandas", label: "Comandas", icon: ReceiptIcon, permission: "comandas.listar", hint: "Consultar e abrir comandas" },
    ],
  },
  {
    id: "vendas",
    label: "Vendas",
    icon: BagIcon,
    defaultOpen: true,
    items: [
      { to: "/caixa", label: "Caixa", icon: CashIcon, permission: "caixa.operar", hint: "Abrir, movimentar e fechar o seu caixa" },
      { to: "/vendas", label: "Vendas", icon: BagIcon, permission: "vendas.listar", hint: "Vendas, recibos e estornos" },
      { to: "/caixas", label: "Histórico de caixas", icon: ArchiveIcon, permission: "caixa.listar", hint: "Caixas de todos os operadores" },
    ],
  },
  {
    id: "financeiro",
    label: "Financeiro",
    icon: WalletIcon,
    defaultOpen: true,
    items: [
      { to: "/contas-receber", label: "Contas a receber", icon: WalletIcon, permission: "financeiro.listar", hint: "Fiado e recebimentos" },
      { to: "/contas-pagar", label: "Contas a pagar", icon: PayableIcon, permission: "contas_pagar.listar", hint: "Despesas, fornecedores e vencimentos" },
      { to: "/financeiro/categorias", label: "Categorias", icon: ListIcon, permission: "financeiro.categorias", hint: "Categorias de receita e despesa" },
      { to: "/formas-pagamento", label: "Formas de pagamento", icon: CardIcon, permission: "formas_pagamento.listar", hint: "Formas aceitas pelo restaurante" },
    ],
  },
  {
    id: "estoque",
    label: "Estoque",
    icon: StockIcon,
    items: [
      { to: "/estoque", label: "Saldos e movimentos", icon: StockIcon, permission: "estoque.listar", hint: "Saldos, entradas, ajustes e perdas" },
      { to: "/inventarios", label: "Inventários", icon: ClipboardCheckIcon, permission: "inventarios.listar", hint: "Contagem física do estoque" },
    ],
  },
  {
    id: "cadastros",
    label: "Cadastros",
    icon: ContactsIcon,
    items: [
      { to: "/pessoas", label: "Pessoas", icon: ContactsIcon, permission: "pessoas.listar", hint: "Clientes, fornecedores e equipe" },
      { to: "/produtos", label: "Produtos", icon: BoxIcon, permission: "catalogo.listar", hint: "Cardápio, categorias, unidades e fichas técnicas" },
    ],
  },
  {
    id: "relatorios",
    label: "Relatórios",
    icon: ChartIcon,
    items: [
      { to: "/relatorios", label: "Painel", icon: ChartIcon, permission: "dashboard.ver", end: true, hint: "Resumo do período: faturamento, ticket médio e mais vendidos" },
      { to: "/relatorios/vendas", label: "Vendas", icon: BagIcon, permission: "relatorios.vendas", ariaLabel: "Relatório de vendas", hint: "Vendas por dia, forma de pagamento, produto ou operador" },
      { to: "/relatorios/produtos", label: "Produtos", icon: BoxIcon, permission: "relatorios.produtos", ariaLabel: "Relatório de produtos", hint: "O que mais vende, margem e curva ABC" },
      { to: "/relatorios/compras", label: "Compras", icon: ArchiveIcon, permission: "relatorios.compras", ariaLabel: "Relatório de compras", hint: "Entradas de estoque por fornecedor, produto e dia" },
      { to: "/relatorios/caixa", label: "Caixa", icon: CashIcon, permission: "relatorios.caixa", ariaLabel: "Relatório de caixa", hint: "Fechamentos e diferenças por operador" },
      { to: "/relatorios/estoque", label: "Estoque", icon: StockIcon, permission: "relatorios.estoque", ariaLabel: "Relatório de estoque", hint: "Posição e valor do estoque" },
      { to: "/relatorios/perdas", label: "Perdas", icon: ClipboardCheckIcon, permission: "relatorios.perdas", ariaLabel: "Relatório de perdas", hint: "Perdas de estoque no período" },
    ],
  },
  {
    id: "administracao",
    label: "Administração",
    icon: ShieldIcon,
    items: [
      { to: "/usuarios", label: "Usuários", icon: UsersIcon, permission: "usuarios.listar", hint: "Quem acessa o sistema" },
      { to: "/papeis", label: "Papéis e permissões", icon: ShieldIcon, permission: "papeis.listar", hint: "O que cada perfil pode fazer" },
      { to: "/auditoria", label: "Auditoria", icon: ListIcon, permission: "auditoria.listar", hint: "Quem fez o quê, e quando" },
      { to: "/configuracoes", label: "Configurações", icon: CogIcon, permission: "configuracoes.ver", hint: "Dados e regras da empresa" },
    ],
  },
];

/** Todos os submódulos, em ordem (útil para testes e buscas). */
export const NAV_ITEMS: NavItem[] = [HOME_ITEM, ...NAV_MODULES.flatMap((module) => module.items)];

/** Módulo a que um caminho pertence (o item de caminho mais específico vence: "/caixas" não é "/caixa"). */
export function moduleOfPath(pathname: string): NavModule | undefined {
  let best: { module: NavModule; length: number } | undefined;
  for (const module of NAV_MODULES) {
    for (const item of module.items) {
      const match = item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
      if (match && (!best || item.to.length > best.length)) best = { module, length: item.to.length };
    }
  }
  return best?.module;
}
