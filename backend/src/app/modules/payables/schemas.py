from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.core.money import Dinheiro
from app.modules.finance.schemas import PessoaResumo

StatusTituloPagar = Literal["aberto", "pago", "cancelado"]
# Situação calculada na consulta: "vencido" e "a_vencer" não são gravados (dependem do dia de hoje).
SituacaoTituloPagar = Literal["a_vencer", "vencido", "pago", "cancelado"]
FiltroSituacao = Literal["todos", "aberto", "vencido", "a_vencer", "pago", "cancelado"]


class CategoriaFinanceiraResumo(BaseModel):
    id: int
    nome: str


class TituloPagarIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    # Fornecedor cadastrado (pessoa com o papel fornecedor); vazio para despesa avulsa.
    pessoa_id: int | None = None
    categoria_id: int | None = None  # categoria financeira do tipo despesa
    descricao: str = Field(min_length=1, max_length=200)
    documento: str | None = Field(default=None, max_length=60)  # nota, boleto
    valor_original: Dinheiro = Field(gt=0)
    vencimento: date
    observacao: str | None = Field(default=None, max_length=500)


class TituloPagarEditarIn(BaseModel):
    """Só o que for enviado muda; enviar null limpa fornecedor, categoria, documento e observação.
    O valor só muda enquanto o título não tem nenhuma baixa (nem estornada)."""

    model_config = ConfigDict(str_strip_whitespace=True)

    pessoa_id: int | None = None
    categoria_id: int | None = None
    descricao: str | None = Field(default=None, min_length=1, max_length=200)
    documento: str | None = Field(default=None, max_length=60)
    valor_original: Dinheiro | None = Field(default=None, gt=0)
    vencimento: date | None = None
    observacao: str | None = Field(default=None, max_length=500)


class CancelarTituloPagarIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    motivo: str = Field(min_length=3, max_length=300)


class BaixaPagarIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    valor: Dinheiro = Field(gt=0)
    # Informativa: o pagamento não movimenta o caixa. 'fiado' é recusado.
    forma_pagamento_id: int
    # Dia do pagamento; padrão hoje no fuso da empresa. Data futura é recusada.
    data_pagamento: date | None = None
    observacao: str | None = Field(default=None, max_length=300)
    # Opcional: o cliente gera uma chave por tentativa (ex.: UUID). Reenviar a mesma chave
    # (clique duplo, retry de rede) devolve a conta como está, sem lançar de novo.
    chave: str | None = Field(
        default=None, min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$"
    )


class EstornarBaixaPagarIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    motivo: str = Field(min_length=3, max_length=300)


class BaixaPagarOut(BaseModel):
    id: int
    valor: Dinheiro  # negativo = estorno
    forma_pagamento_id: int
    forma: str
    data_pagamento: date
    estorno_de_id: int | None
    # Pagamento (valor > 0) que já foi desfeito por um estorno.
    estornada: bool
    observacao: str | None
    created_at: datetime
    usuario_nome: str | None


class TituloPagarOut(BaseModel):
    id: int
    fornecedor: PessoaResumo | None
    categoria: CategoriaFinanceiraResumo | None
    descricao: str
    documento: str | None
    observacao: str | None
    valor_original: Dinheiro
    valor_pago: Dinheiro
    saldo: Dinheiro
    vencimento: date
    status: StatusTituloPagar
    situacao: SituacaoTituloPagar
    # Só em título aberto: vencimento - hoje (negativo = dias de atraso).
    dias_para_vencer: int | None
    # Dia do último pagamento vigente; só em título pago.
    pago_em: date | None
    cancelado_motivo: str | None
    created_at: datetime


class TituloPagarDetalheOut(TituloPagarOut):
    baixas: list[BaixaPagarOut]


class ResumoPagarOut(BaseModel):
    data_referencia: date  # hoje no fuso da empresa
    em_aberto: Dinheiro  # soma dos saldos dos títulos abertos (vencidos + a vencer)
    em_aberto_qtd: int
    vencido: Dinheiro
    vencido_qtd: int
    a_vencer_7_dias: Dinheiro  # vencimento de hoje até hoje + 7 dias
    a_vencer_7_dias_qtd: int
    pago_no_mes: Dinheiro  # baixas líquidas (descontados os estornos) com data no mês corrente
    pago_no_mes_qtd: int  # pagamentos vigentes no mês
    mes_de: date
    mes_ate: date
