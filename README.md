# Sistema de gestão e PDV para restaurantes

Sistema web para o dia a dia de restaurantes: mesas, comandas, caixa, estoque, fiado e relatórios, com
auditoria de tudo que mexe em dinheiro ou estoque.

Cada empresa é uma **instalação isolada** (web + api + banco PostgreSQL próprios) atrás de um Nginx
único, com um subdomínio por empresa. Não existe `tenant_id`: uma empresa nunca enxerga o banco de outra.

| Parte | Tecnologia |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL 16 |
| Frontend | React 18, TypeScript, Vite, Tailwind 4, TanStack Query, React Hook Form + Zod |
| Deploy | Docker Compose por empresa, Nginx, Certbot (HTTP-01), scripts em `deploy/scripts/` |

## Estrutura

```
backend/    API (src/app/modules/*), migrations (migrations/) e testes (tests/)
frontend/   Aplicação React (src/features/*), testes unitários e E2E (e2e/)
deploy/     Imagens, templates do compose, Nginx e scripts de provisionar/backup/restaurar/atualizar
docs/       Decisões e o porquê delas (decisoes/), runbook de operação e plano do piloto
```

## Como rodar em desenvolvimento

Pré-requisitos: Python 3.12, Node 20+, pnpm, Docker.

```bash
make setup     # uma vez: venv do backend + pnpm install
make dev-db    # sobe o Postgres de dev, roda migrations e, se for novo, cria admin e dados de demonstração
make dev       # backend (porta 8010) + frontend (http://localhost:5173); Ctrl+C encerra os dois
```

Login: `admin@dev.example.com` / `SenhaDev#2026xyz` (a troca de senha é obrigatória no primeiro acesso).

- Em terminais separados: `make dev-api` e `make dev-web`. Outra porta da API: `PORTA_API=8020 make dev`.
- O Postgres de dev guarda os dados em memória: se o container cair ou a máquina reiniciar, rode
  `make dev-db` de novo. O script é idempotente (só recria admin e demonstração em banco novo).
- O dev usa o banco `pdv_dev`, clonado do molde `pdv_test` dos testes, para não misturar dados.
- Tudo está em [deploy/dev/dev.sh](deploy/dev/dev.sh).

## Testes e verificações

```bash
make test        # backend: pytest contra Postgres real (sobe o banco sozinho)
make lint        # ruff
make openapi     # regenera frontend/openapi.json; depois: cd frontend && pnpm gen:api
make e2e         # Playwright em navegador, com a stack completa em Docker (desktop e celular)
make isolamento  # duas empresas locais: prova isolamento, backup/restauração e atualização
cd frontend && pnpm typecheck && pnpm lint && pnpm test --run
```

Os tipos do frontend são gerados do OpenAPI do backend: mudou contrato da API, regenere antes.

## Regras de negócio, por módulo

Cada módulo fica em `backend/src/app/modules/<nome>` e tem a tela correspondente em
`frontend/src/features/`. O motivo de cada decisão está em [docs/decisoes/](docs/decisoes/).

| Módulo | O que faz | Regras principais |
|---|---|---|
| **auth** | Login, sessão, troca de senha | Senha com Argon2id e política (mín. 10, sem senhas comuns). 8 falhas bloqueiam a conta por 15 min. Token de acesso de 15 min; renovação por cookie `httpOnly` que gira a cada uso. Troca/redefinição de senha derruba as sessões antigas. |
| **users / rbac** | Usuários, papéis e permissões | Permissão por ação (`modulo.acao`), conferida no backend em toda rota. Papéis: Administrador, Gerente, Frente de loja, Atendente (editáveis). Ninguém concede permissão que não tem nem mexe em usuário acima do seu poder. A empresa nunca fica sem administrador. |
| **audit** | Trilha de auditoria | Registra quem, quando, de onde e o antes/depois, na mesma transação do fato. É somente-inserção: nem a API nem o dono do banco conseguem alterar ou apagar. Senha, token e CPF são mascarados. |
| **config** | Configurações da empresa | Fuso horário, taxa de serviço (%) e janela de cancelamento de item. |
| **people** | Clientes, fornecedores, colaboradores | CPF/CNPJ validado e mascarado para quem não tem permissão de ver. Cadastro rápido no balcão (nome + telefone). Cliente define se aceita fiado e o limite. |
| **catalog** | Produtos, categorias, unidades, ficha técnica | Tipos: revenda, preparado, insumo, embalagem. Ficha técnica de um nível: vender um prato baixa os insumos. |
| **inventory** | Estoque, movimentos e inventário | Saldo = soma dos movimentos (nunca editado à mão). Estoque negativo bloqueado, salvo permissão + justificativa. Custo médio ponderado, atualizado a cada entrada. Perdas, ajustes e inventário geram movimentos auditados. |
| **tables** | Mesas | Livre, ocupada, aguardando pagamento, reservada, bloqueada. A mesa segue a comanda; só uma comanda em andamento por mesa. |
| **orders** | Comandas | Tipos: mesa, balcão, retirada, delivery. Preço congelado ao lançar. Cancelar item exige motivo (atendente só o que lançou e dentro de 5 min; depois, gerente). Desconto exige justificativa e respeita o limite do papel (admin 100%, gerente 20%, frente 5%, atendente 0). Transferência de mesa. Todos os valores são calculados no backend. |
| **cash** | Caixa e formas de pagamento | Um caixa aberto por operador. Sangria e reforço. Fechamento por **conferência cega**: o operador conta cada forma sem ver o esperado; diferença exige justificativa. Reabertura só com permissão e fica auditada. |
| **sales** | Fechamento da comanda e estorno | Fechar é **uma única transação**: venda, pagamentos, caixa, baixa de estoque, mesa liberada e auditoria. Se algo falha, nada é gravado. Fechamento repetido ou simultâneo gera uma só venda. Pagamento pode ser dividido; dinheiro admite troco; fiado exige permissão e respeita o limite. Estorno cria lançamentos inversos (caixa, estoque, título) sem alterar o histórico. |
| **finance** | Contas a receber (fiado) | Fiado vira título; baixa parcial ou total entra no caixa de quem recebe. Baixa repetida por reenvio é ignorada (chave de idempotência). |
| **reports** | Dashboard e relatórios | Faturamento, ticket médio, mais vendidos, formas de pagamento, estoque baixo, relatórios de vendas, caixa, estoque e perdas. Dia, semana e mês seguem o **fuso da empresa**. |

### Regras que valem para o sistema todo

- **Dinheiro nunca é `float`**: `NUMERIC` no banco, `Decimal` no código, texto no JSON. O frontend exibe,
  não calcula totais.
- **Histórico não se reescreve**: auditoria, movimentos de caixa e de estoque, vendas e baixas são
  somente-inserção. Erro se corrige com lançamento inverso (estorno, ajuste).
- **Sem duplicidade por corrida**: travas de banco e índices únicos garantem que cliques repetidos ou
  requisições simultâneas não dupliquem venda, baixa de estoque ou recebimento.
- **Acesso negado também é auditado.**

## Produção

Cada empresa é criada com um único comando, que gera segredos próprios, sobe os três containers, roda
as migrations, cria o administrador, emite o certificado e agenda o backup:

```bash
/opt/sistema-pdv/bin/provisionar-empresa.sh --slug sabores1 --nome "Sabores 1" \
  --admin-email dono@sabores1.com.br --admin-nome "Dono"
```

Atualização, backup e restauração são `atualizar-empresa.sh`, `backup-empresa.sh` e
`restaurar-empresa.sh`. Passo a passo completo em [docs/runbook-operacao.md](docs/runbook-operacao.md);
critérios do piloto em [docs/piloto.md](docs/piloto.md); decisões ainda a confirmar em
[docs/decisoes/decisoes-pendentes.md](docs/decisoes/decisoes-pendentes.md).
