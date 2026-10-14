import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Input } from "@/components/controls";
import { SearchIcon } from "@/components/icons";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { usePermissions } from "@/lib/auth/hooks";
import type { Pessoa } from "./types";

export interface ClientValue {
  id: number;
  nome: string;
  /** Perfil de cliente (fiado), presente quando vem da busca de pessoas. */
  cliente?: Pessoa["cliente"];
}

export interface ClientPickerProps {
  label: string;
  value: ClientValue | null;
  onChange: (pessoa: ClientValue | null) => void;
  disabled?: boolean;
  hint?: string;
  /** Mensagem de erro do campo (ex.: "Informe o cliente para vender em fiado"). */
  error?: string | undefined;
}

function useDebounced(value: string, ms = 250): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * Seleção de cliente por busca (GET /pessoas?papel=cliente) com cadastro rápido opcional
 * (POST /pessoas/rapido, só com pessoas.cadastro_rapido). Cadastro rápido NÃO habilita fiado.
 */
export function ClientPicker({ label, value, onChange, disabled, hint, error }: ClientPickerProps) {
  const { can } = usePermissions();
  const canSearch = can("pessoas.listar");
  const canRegister = can("pessoas.cadastro_rapido");
  const id = useId();
  const [term, setTerm] = useState("");
  const [registering, setRegistering] = useState(false);
  const query = useDebounced(term.trim());

  const results = useQuery({
    queryKey: ["pessoas", "busca-cliente", query],
    queryFn: ({ signal }) => api.get("/pessoas", { query: { q: query, papel: "cliente", ativo: true, limite: 8 }, signal }),
    enabled: canSearch && !value && query.length >= 2,
    staleTime: 15_000,
  });

  function choose(p: ClientValue | null) {
    setTerm("");
    setRegistering(false);
    onChange(p);
  }

  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;

  return (
    <div role="group" aria-labelledby={`${id}-label`} aria-describedby={describedBy}>
      <p id={`${id}-label`} className="mb-1 text-sm font-medium text-fg">
        {label}
      </p>

      {value ? (
        <div className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-line-strong bg-surface px-3 py-1.5">
          <span className="min-w-0 truncate font-medium text-fg">{value.nome}</span>
          {!disabled && (
            <Button size="sm" className="min-h-11 shrink-0" onClick={() => choose(null)} aria-label={`Trocar cliente ${value.nome}`}>
              Trocar
            </Button>
          )}
        </div>
      ) : !canSearch && !canRegister ? (
        <p className="text-sm text-muted">Você não tem permissão para buscar ou cadastrar clientes.</p>
      ) : (
        <div className="space-y-2">
          {canSearch && (
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" width={16} height={16} />
              <Input
                type="search"
                aria-label={`${label}: buscar por nome`}
                placeholder="Buscar cliente por nome ou telefone"
                className="min-h-11 pl-9"
                value={term}
                disabled={disabled}
                onChange={(e) => setTerm(e.target.value)}
                aria-invalid={error ? true : undefined}
              />
            </div>
          )}

          {canSearch && query.length >= 2 && (
            <div aria-live="polite">
              {results.isLoading ? (
                <p className="px-1 text-sm text-muted">Buscando…</p>
              ) : results.error ? (
                <p className="px-1 text-sm text-danger-text">{errorMessage(results.error)}</p>
              ) : results.data && results.data.itens.length > 0 ? (
                <ul aria-label="Clientes encontrados" className="divide-y divide-line overflow-hidden rounded-md border border-line">
                  {results.data.itens.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => choose(p)}
                        className="flex min-h-11 w-full flex-col items-start justify-center px-3 py-1.5 text-left hover:bg-surface-2"
                      >
                        <span className="font-medium text-fg">{p.nome}</span>
                        <span className="text-xs text-muted">
                          {[p.telefone ?? p.whatsapp, p.cliente?.aceita_fiado ? "Aceita fiado" : null].filter(Boolean).join(" · ") || "Sem telefone"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-1 text-sm text-muted">Nenhum cliente encontrado.</p>
              )}
            </div>
          )}

          {canRegister && !registering && (
            <Button className="min-h-11" disabled={disabled} onClick={() => setRegistering(true)}>
              Cadastro rápido de cliente
            </Button>
          )}
          {canRegister && registering && <QuickRegister initialName={term.trim()} onCancel={() => setRegistering(false)} onCreated={choose} />}
        </div>
      )}

      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}

function QuickRegister({ initialName, onCancel, onCreated }: { initialName: string; onCancel: () => void; onCreated: (p: Pessoa) => void }) {
  const client = useQueryClient();
  const [nome, setNome] = useState(initialName);
  const [telefone, setTelefone] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: (body: { nome: string; telefone: string }) => api.post("/pessoas/rapido", { body }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["pessoas"] }),
  });

  async function submit() {
    setLocalError(null);
    if (!nome.trim()) return setLocalError("Informe o nome do cliente.");
    if (telefone.trim().length < 8) return setLocalError("Informe o telefone (mínimo de 8 caracteres).");
    try {
      onCreated(await create.mutateAsync({ nome: nome.trim(), telefone: telefone.trim() }));
    } catch (error) {
      setLocalError(errorMessage(error));
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-line bg-surface-2 p-3">
      <p className="text-sm font-medium text-fg">Cadastro rápido</p>
      <Input aria-label="Nome do novo cliente" placeholder="Nome" className="min-h-11" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" />
      <Input aria-label="Telefone do novo cliente" placeholder="Telefone" type="tel" inputMode="tel" className="min-h-11" value={telefone} onChange={(e) => setTelefone(e.target.value)} autoComplete="off" />
      <p className="text-xs text-muted">O cadastro rápido não habilita o cliente para fiado; isso é definido no cadastro completo.</p>
      {localError && <Alert tone="danger">{localError}</Alert>}
      <div className="flex gap-2">
        <Button variant="primary" className="min-h-11" loading={create.isPending} onClick={() => void submit()}>
          Cadastrar
        </Button>
        <Button className="min-h-11" onClick={onCancel} disabled={create.isPending}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
