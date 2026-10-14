import type { components } from "@/lib/api/schema";

// Aliases dos tipos gerados (schema.d.ts) usados nas telas de operação do PDV.
type Schemas = components["schemas"];

export type Comanda = Schemas["ComandaOut"];
export type ComandaResumo = Schemas["ComandaResumoOut"];
export type ComandaItem = Schemas["ItemOut"];
export type ComandaAjuste = Schemas["AjusteOut"];
export type ComandaAbrirIn = Schemas["ComandaAbrirIn"];
export type Divisao = Schemas["DivisaoOut"];
export type Mesa = Schemas["MesaOut"];
export type MesaMapa = Schemas["MesaMapaOut"];
export type Venda = Schemas["VendaOut"];
export type VendaResumo = Schemas["VendaResumoOut"];
export type VendaPagamento = Schemas["VendaPagamentoOut"];
export type FecharComandaIn = Schemas["FecharComandaIn"];
export type PagamentoIn = Schemas["PagamentoIn"];
export type Caixa = Schemas["CaixaOut"];
export type CaixaResumo = Schemas["CaixaResumoOut"];
export type MovimentoCaixa = Schemas["MovimentoCaixaOut"];
export type FormaPagamento = Schemas["FormaPagamentoOut"];
export type FormaTipo = FormaPagamento["tipo"];
export type Titulo = Schemas["TituloOut"];
export type SaldoAberto = Schemas["SaldoAbertoOut"];
export type HistoricoCliente = Schemas["HistoricoOut"];
export type Pessoa = Schemas["PessoaOut"];
export type PessoaResumo = Schemas["PessoaResumo"];
export type Produto = Schemas["ProdutoOut"];
export type Categoria = Schemas["CategoriaOut"];
export type MesaStatus = MesaMapa["status"];
