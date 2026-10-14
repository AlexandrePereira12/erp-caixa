# 0008 — Pix copia e cola e QR Code nas configurações

**Status:** vigente. **Código:** `backend/src/app/core/pix.py`, `backend/src/app/modules/config/{models,schemas,router}.py`,
migration `0006`, `frontend/src/components/QrCode.tsx`, `frontend/src/features/settings/{SettingsPage,PixPreview}.tsx`.

## Decisão

O administrador cola nas **Configurações** o "Pix copia e cola" da chave da empresa; o sistema valida o texto, guarda
e mostra o **QR Code** dele, com o nome do recebedor e um botão de copiar. Sem API de banco e sem credencial: o
"copia e cola" estático é só um texto (BR Code, padrão EMV QR) e o QR é o desenho desse mesmo texto, feito no
navegador (`uqr`, nível de correção M, módulos pretos sobre fundo branco nos dois temas).

Quem edita é quem tem `configuracoes.editar`, que só o papel Administrador traz (o Gerente só vê). Não há permissão nova.

## Por quê

- **Sem API financeira.** Integrar com PSP/banco traria credenciais, contrato e conciliação automática, que não
  foram pedidos. O estático resolve "mostrar o QR da empresa" com zero dependência externa.
- **Consequência assumida:** o sistema **não sabe se o cliente pagou**. Quem confere é o caixa, no app do banco;
  a tela diz isso ao lado do QR. Conciliação automática exigiria um PSP (Pix dinâmico + webhook) e seria outra decisão.
- **Validação no backend, e rígida**, porque um código errado manda dinheiro para o lugar errado sem ninguém notar:
  tem que ser EMV inteiro (campo 00 = 01 primeiro, campo 63 por último), com o CRC16 (CCITT-FALSE, sobre bytes
  UTF-8) conferindo e o identificador `br.gov.bcb.pix`. Isso pega texto cortado, colado pela metade ou alterado.
  Só se aparam as pontas e se tiram quebras de linha; espaço interno fica (nome e cidade têm espaço e entram no CRC).
- **Recusa Pix dinâmico** (indicador `12` ou URL no campo 25): vale para uma cobrança só e expira; guardado como
  código permanente deixaria o QR da empresa inútil.
- **Recusa valor fixo** (campo 54 > 0): todo cliente pagaria aquele valor. Sem valor, o código serve para qualquer venda
  e fica pronto para, no futuro, o sistema inserir o valor da conta (campo 54 + novo CRC) também sem API.
- **Nome do recebedor** (campo 59) devolvido pela API (`pix_recebedor`, calculado, nunca levanta erro): o admin
  confere de relance se o QR é o dele.
- **Auditoria registra antes e depois** do campo, com o usuário: trocar o Pix é trocar para onde o dinheiro vai, e
  o valor não é mascarado de propósito (não é segredo; mascarar esconderia o que mudou).
- **Mensagem de erro em português no campo:** o validador usa `PydanticCustomError`; com `ValueError` o Pydantic
  prefixaria "Value error, " em inglês e o handler repassa a mensagem como vem.
- **Campo ausente não mexe; `null` ou texto vazio apaga.** O PATCH das configurações ignorava `null`; para o Pix
  usa-se `model_fields_set` para distinguir "não enviado" de "apagar".

## Restrições que não são óbvias

- O QR é desenhado com fundo branco e margem de 4 módulos mesmo no tema escuro: leitor de QR precisa de contraste
  claro/escuro e da margem; o tema do sistema não vale aqui.
- Verificado de ponta a ponta: o QR renderizado na tela (tema claro e escuro) foi decodificado com `zbarimg` e voltou
  idêntico ao texto salvo. Teste de unidade do desenho não prova isso; refaça essa conferência se trocar a biblioteca.
- `pix.py` tem o vetor de catálogo do CRC (`"123456789"` → `29B1`) e o exemplo do manual do BR Code do Banco Central
  nos testes.
- Quem só tem `configuracoes.ver` também vê o QR e o código: não é segredo, é o que o cliente escaneia.

## QR Code com o valor, no Fechar conta

Na linha de pagamento cuja forma é do tipo Pix, o diálogo de fechar conta mostra o QR Code **do valor daquela linha**
(com botão de copiar). O valor acompanha o que o caixa digita, então pagamento dividido (parte no Pix, parte em
dinheiro) gera o QR só da parte do Pix. Linha sem valor válido, ou de outra forma, não mostra QR.

- **O código com valor é montado no navegador** (`frontend/src/lib/pix.ts`): insere o campo 54 depois da moeda (campos
  em ordem de ID), troca um valor que já exista e refaz o CRC16. Sem ida ao servidor a cada tecla e sem API de banco.
  É a segunda cópia da lógica de CRC (a primeira é `core/pix.py`, que valida o que se cadastra); `lib/pix.test.ts` e
  `backend/tests/test_pix.py` fixam os **mesmos vetores**, montados do zero com o CRC do backend, inclusive com nome
  acentuado (tamanho em caracteres, CRC em bytes UTF-8). Se mexer num lado, os dois testes cobram o outro.
- **Rota própria para o caixa:** `GET /configuracoes/pix` exige `comandas.fechar`. Quem fecha a conta (Frente de loja)
  não tem `configuracoes.ver`, então ler `/configuracoes` daria 403 justamente para quem precisa do código.
  A rota devolve só o Pix e o nome do recebedor.
- **Não atrapalha o fechamento:** se a leitura do Pix falhar, a conta fecha do mesmo jeito, sem QR e sem alerta. Sem Pix
  cadastrado, a linha mostra um aviso curto de onde cadastrar (em Configurações).
- **Continua sem confirmação automática:** o texto ao lado do QR manda o caixa conferir o recebimento no app do banco
  antes de confirmar o fechamento. O sistema só registra a forma de pagamento informada.
- Verificado no navegador: o QR da tela de fechamento (total e valor editado) foi decodificado com `zbarimg` e voltou
  idêntico ao código esperado, montado à parte em Python.
