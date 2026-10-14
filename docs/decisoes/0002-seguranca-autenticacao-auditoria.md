# 0002 — Autenticação, permissões e auditoria

**Status:** vigente (Fase 0). **Código:** `backend/src/app/core/{security,audit,deps,middleware}.py`,
`modules/{auth,users,rbac,audit}`.

## Autenticação

- Senha com **Argon2id**; mínimo de 10 caracteres, recusando senhas comuns (lista embutida) e senhas que
  contêm o e-mail. Login de e-mail inexistente gasta o mesmo tempo de um existente (hash descartável) e a
  resposta é idêntica: não dá para enumerar usuários.
- **Bloqueio por tentativas**: 8 falhas seguidas bloqueiam a conta por 15 minutos (`429`, com o tempo
  restante); sucesso, troca ou redefinição de senha zeram o contador. Motivo: o rate limit por IP não
  protege uma conta específica contra tentativas distribuídas.
- **Access token** JWT HS256 de 15 min, mantido só em memória no frontend. Cada requisição relê o usuário
  no banco: suspensão, exclusão e troca de papel valem na hora, sem esperar o token expirar.
- **Refresh token** opaco, guardado só como hash SHA-256, em cookie `httpOnly; Secure; SameSite=Strict;
  Path=/api/v1/auth`. Cada uso **rotaciona** o token. Reapresentar um token já usado é tratado como
  roubo: a família inteira é revogada e o evento fica na auditoria. A API e o frontend ficam na mesma
  origem (`/api`), então não há CORS.
- `must_change_password`: usuário criado ou redefinido por um administrador só consegue trocar a senha
  até fazê-lo. Trocar ou redefinir a senha revoga todas as sessões anteriores.
- **Invalidação imediata de tokens**: `usuario.tokens_invalidos_ate` guarda o instante a partir do qual
  access tokens antigos deixam de valer (o `iat` do JWT tem precisão fracionária, para não confundir o
  token emitido no mesmo segundo). Troca e redefinição de senha, suspensão e exclusão de usuário usam isso; sem ele, um token
  roubado continuaria valendo até 15 min depois da troca.

## Permissões

- Permissão por ação, no formato `modulo.acao`, declarada em `modules/rbac/catalog.py` (fonte da
  verdade no código). `sincronizar` roda a cada deploy: cria o que falta e concede a permissão nova
  **só** aos papéis padrão que a listam e **só na primeira vez** — ajuste manual do administrador nunca é
  sobrescrito. O Administrador sempre tem tudo.
- Toda rota declara sua política (`exigir_permissao` ou `autenticado`). `tests/test_rbac_rotas.py`
  enumera os routers e falha se uma rota nova não tiver política, ou se uma política não valer (401 sem
  token, 403 sem a permissão).
- Regras anti-escalada: ninguém concede papel ou permissão que o próprio concedente não possui; **ninguém
  altera, suspende, exclui ou redefine a senha de um usuário que tem poder acima do seu** (um papel com
  permissão que o ator não tem); só quem tem `usuarios.gerir_administradores` altera um administrador; a
  empresa nunca fica sem administrador ativo; ninguém suspende, exclui ou redefine a própria senha por
  essa via. Sem a regra do "acima do seu", um gerente redefiniria a senha de outro perfil mais forte e
  assumiria a conta.
- O limite de desconto por papel (`papel.limite_desconto_pct`) é **privilégio**: só concede/edita limite
  quem tem esse limite ou mais. É cumulativo na comanda e verificado no backend. Acima do limite o backend
  recusa e a UI orienta chamar um gerente (autorização por PIN é evolução futura).
- **CPF/CNPJ**: a API devolve mascarado (`***12`: só os 2 últimos dígitos) para quem não tem `pessoas.ver_documento`,
  `pessoas.criar` ou `pessoas.editar`; o documento completo só vai a quem precisa dele para trabalhar.

## Auditoria

- `auditoria_log` é **append-only em duas camadas independentes**: o role da API não tem
  UPDATE/DELETE/TRUNCATE e um trigger bloqueia as mesmas operações até para o owner. O mesmo vale para
  `movimento_caixa`, `movimento_estoque`, `caixa_evento`, `comanda_evento` e `titulo_receber_baixa`.
- A auditoria é gravada **na mesma transação** do fato: se a operação é desfeita, o registro vai junto.
  Exceções, em transação própria: `LOGIN_FALHA` e `ACESSO_NEGADO`.
- O diff antes/depois é calculado sobre os valores reais **e só depois** a redação mascara senha, token,
  PIN, cartão e CPF/CNPJ (ficam os 2 últimos dígitos), uma única vez, ao gravar. Mascarar antes esconderia
  mudanças; mascarar duas vezes produzia `***` no diff. Textos longos são truncados no tamanho da coluna.
- `ACESSO_NEGADO` é gravado na sessão da requisição com commit próprio, depois de a permissão ser
  recusada (o `registrar_isolado` foi removido: gravar em sessão separada deixava a auditoria divergir da
  transação).
- Logs da aplicação são JSON, sem corpo de requisição e sem query string (pode conter CPF). Há teste
  garantindo que senha, token e CPF não aparecem (`tests/test_seed_e_logs.py`).
