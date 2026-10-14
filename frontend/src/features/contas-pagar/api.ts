import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { components } from "@/lib/api/schema";

type Schemas = components["schemas"];

export type TituloPagar = Schemas["TituloPagarOut"];
export type TituloPagarDetalhe = Schemas["TituloPagarDetalheOut"];
export type BaixaPagar = Schemas["BaixaPagarOut"];
export type ResumoPagar = Schemas["ResumoPagarOut"];
export type TituloPagarIn = Schemas["TituloPagarIn"];
export type TituloPagarEditarIn = Schemas["TituloPagarEditarIn"];
export type BaixaPagarIn = Schemas["BaixaPagarIn"];
export type SituacaoTitulo = TituloPagar["situacao"];
export type SituacaoFiltro = "todos" | "aberto" | SituacaoTitulo;

/** Prefixo único de tudo que é de contas a pagar (lista, detalhe e resumo): invalidar o prefixo atualiza as três. */
export const contasPagarKey = ["contas-pagar"] as const;
export const CONTAS_PAGAR_PAGE_SIZE = 20;

export interface ContasPagarFilters {
  situacao: SituacaoFiltro;
  pessoaId?: number | undefined;
  categoriaId?: number | undefined;
  /** Datas YYYY-MM-DD do campo de data; `vencimentoAte` é inclusivo no backend. */
  vencimentoDe?: string | undefined;
  vencimentoAte?: string | undefined;
  q?: string | undefined;
  deslocamento: number;
  /** false enquanto o filtro está inválido (ex.: data inicial depois da final): não consulta o backend. */
  enabled?: boolean | undefined;
}

export function useContasPagar(filters: ContasPagarFilters) {
  const { enabled = true, ...params } = filters;
  return useQuery({
    queryKey: [...contasPagarKey, "lista", params],
    queryFn: ({ signal }) =>
      api.get("/contas-pagar", {
        query: {
          situacao: params.situacao === "todos" ? undefined : params.situacao,
          pessoa_id: params.pessoaId,
          categoria_id: params.categoriaId,
          vencimento_de: params.vencimentoDe,
          vencimento_ate: params.vencimentoAte,
          q: params.q,
          limite: CONTAS_PAGAR_PAGE_SIZE,
          deslocamento: params.deslocamento,
        },
        signal,
      }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useResumoPagar() {
  return useQuery({
    queryKey: [...contasPagarKey, "resumo"],
    queryFn: ({ signal }) => api.get("/contas-pagar/resumo", { signal }),
  });
}

export function useContaPagar(id: number | undefined) {
  return useQuery({
    queryKey: [...contasPagarKey, "detalhe", id],
    queryFn: ({ signal }) => api.get("/contas-pagar/{titulo_id}", { path: { titulo_id: id! }, signal }),
    enabled: id !== undefined,
  });
}

/** Fornecedores (pessoas com o papel fornecedor) para o filtro e o cadastro. Exige pessoas.listar. */
export function useFornecedores(options: { q: string; somenteAtivos: boolean; enabled: boolean }) {
  const { q, somenteAtivos, enabled } = options;
  return useQuery({
    queryKey: ["pessoas", "busca-fornecedor", q, somenteAtivos],
    queryFn: ({ signal }) => api.get("/pessoas", { query: { q, papel: "fornecedor", ...(somenteAtivos ? { ativo: true } : {}), limite: 8 }, signal }),
    enabled: enabled && q.length >= 2,
    staleTime: 15_000,
  });
}

/**
 * Mutations de contas a pagar. Sucesso grava o título devolvido e invalida o prefixo inteiro (lista,
 * detalhe e resumo). Um 409 (o título mudou: saldo menor, já paga, já cancelada...) também invalida,
 * para a tela mostrar o estado real junto da mensagem do backend.
 */
export function useContaPagarMutations() {
  const client = useQueryClient();
  const invalidate = () => void client.invalidateQueries({ queryKey: contasPagarKey });
  const onSuccess = (titulo: TituloPagarDetalhe) => {
    client.setQueryData([...contasPagarKey, "detalhe", titulo.id], titulo);
    invalidate();
  };
  const onError = (error: unknown) => {
    if (error instanceof ApiError && error.status === 409) invalidate();
  };
  return {
    criar: useMutation({ mutationFn: (body: TituloPagarIn) => api.post("/contas-pagar", { body }), onSuccess, onError }),
    editar: useMutation({
      mutationFn: ({ id, body }: { id: number; body: TituloPagarEditarIn }) => api.patch("/contas-pagar/{titulo_id}", { path: { titulo_id: id }, body }),
      onSuccess,
      onError,
    }),
    cancelar: useMutation({
      mutationFn: ({ id, motivo }: { id: number; motivo: string }) => api.post("/contas-pagar/{titulo_id}/cancelar", { path: { titulo_id: id }, body: { motivo } }),
      onSuccess,
      onError,
    }),
    baixar: useMutation({
      mutationFn: ({ id, body }: { id: number; body: BaixaPagarIn }) => api.post("/contas-pagar/{titulo_id}/baixas", { path: { titulo_id: id }, body }),
      onSuccess,
      onError,
    }),
    estornar: useMutation({
      mutationFn: ({ id, baixaId, motivo }: { id: number; baixaId: number; motivo: string }) =>
        api.post("/contas-pagar/{titulo_id}/baixas/{baixa_id}/estornar", { path: { titulo_id: id, baixa_id: baixaId }, body: { motivo } }),
      onSuccess,
      onError,
    }),
  };
}
