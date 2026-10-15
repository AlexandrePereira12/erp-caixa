# 0009 — Dados da empresa e recibo no formato de cupom

**Status:** vigente. **Código:** `backend/src/app/modules/config/*`, migration `0007`,
`frontend/src/features/settings/SettingsPage.tsx`, `frontend/src/components/pdv/{receipt.tsx,PrintArea.tsx}`,
`frontend/src/features/{vendas/VendaReceipt,comandas/ComandaReceipt}.tsx`.

## Decisão

- **Configurações** ganham a seção "Dados da empresa": nome de exibição (já existia), **CNPJ, telefone, endereço e
  e-mail de contato**, todos opcionais. Saem no cabeçalho do recibo; linha vazia não aparece.
- O **recibo da venda** e a **conferência da comanda** passam a ter o formato de cupom de impressora térmica (80 mm):
  cabeçalho centralizado com os dados da empresa, filete duplo, `CLIENTE` (ou `CONSUMIDOR`), título, data/comanda/
  operador, cada item em duas linhas (`código DESCRIÇÃO` e `qtd x unitário => total`), subtotal e descontos, `TOTAL`,
  pagamentos com recebido e troco, filete duplo e a nota "Comprovante sem valor fiscal.". Fonte monoespaçada do
  próprio sistema, sem cor, filetes feitos com borda CSS (não com sequências de caracteres).
- **Não precisa de biblioteca nova:** o cupom é HTML + CSS impresso com `window.print()` (o portal de impressão já existia).
  O "outro formato" de verdade seria ESC/POS direto na impressora térmica (WebUSB/Serial), que depende do modelo da
  impressora e do navegador; fica como opção futura, não foi feito.

## Por quê

- **CNPJ e telefone ficam só com dígitos** no banco e saem com máscara na tela e no cupom. O CNPJ é validado pelos
  dígitos verificadores (`core/documentos`), o telefone exige DDD (10 ou 11 dígitos) e o e-mail é conferido; as mensagens
  voltam em português, no campo (`PydanticCustomError`, para não vir "Value error," em inglês).
- **Apagar um dado:** `null` ou texto vazio apagam; campo ausente no PATCH não mexe (`model_fields_set`, o mesmo laço do Pix).
- **Rota própria para o recibo:** `GET /configuracoes/empresa` exige só estar logado. Quem imprime nem sempre tem
  `configuracoes.ver` (a Frente de loja fecha e reimprime venda, o Atendente imprime o resumo da comanda) e os dados são os
  mesmos que o cliente recebe impressos. A edição continua em `configuracoes.editar` (só Administrador).
- **Auditoria:** a chave `cnpj` é mascarada pela regra de redação (`***81`); o teste aceita isso de propósito, não se
  renomeou a coluna para escapar da máscara.
- **A impressão abre na hora** (`window.print()` ao montar). Por isso a página busca os dados da empresa antes e o botão
  Imprimir fica desabilitado até a consulta terminar; se ela falhar, imprime sem cabeçalho. Nada de espera por tempo.
- **Título "Recibo de venda #N", não "Comprovante adicional de venda":** esse termo é de NFC-e e sugere documento fiscal. O
  rodapé continua dizendo que não tem valor fiscal.
- **Sem unidade (UN) nos itens:** a venda não guarda a unidade do produto e a API não foi ampliada só para isso.
- **Dinheiro com 2 casas** (o "6,000" do exemplo é do sistema de origem); quantidade com 3.
- **Só o TROCO total** aparece (antes saía também por pagamento, repetindo o mesmo valor).

## Restrições que não são óbvias

- O `@page` (margem de 8 mm) é global e compartilhado com a folha A4 dos relatórios: o cupom só limita a largura da
  coluna em `.rc`. Não mexer no `@page` por causa do cupom.
- Verificado no navegador em mídia `print` (com `window.print` neutralizado para o portal ficar montado): venda com troco,
  nome de produto comprido quebrando em 80 mm, empresa só com o nome e conferência da comanda.
- Impressoras térmicas variam na fonte: a pilha é `DejaVu Sans Mono`, `Liberation Mono`, `Consolas`, `Courier New`.
