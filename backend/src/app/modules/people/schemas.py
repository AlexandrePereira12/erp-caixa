import re
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.money import Dinheiro

PapelPessoa = Literal["cliente", "fornecedor", "colaborador"]


class EnderecoIn(BaseModel):
    rotulo: str | None = Field(default=None, max_length=30)
    cep: str | None = Field(default=None, max_length=9)
    logradouro: str = Field(min_length=1, max_length=160)
    numero: str | None = Field(default=None, max_length=20)
    complemento: str | None = Field(default=None, max_length=80)
    bairro: str | None = Field(default=None, max_length=80)
    cidade: str = Field(min_length=1, max_length=80)
    uf: str = Field(min_length=2, max_length=2)
    principal: bool = False

    @field_validator("uf")
    @classmethod
    def _uf(cls, v: str) -> str:
        v = v.strip().upper()
        if not re.fullmatch(r"[A-Z]{2}", v):
            raise ValueError("UF deve ter duas letras")
        return v

    @field_validator("cep")
    @classmethod
    def _cep(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return None
        digitos = re.sub(r"\D", "", v)
        if len(digitos) != 8:
            raise ValueError("CEP deve ter 8 dígitos")
        return digitos


class EnderecoOut(EnderecoIn):
    model_config = ConfigDict(from_attributes=True)

    id: int


class ClienteIn(BaseModel):
    aceita_fiado: bool = False
    limite_fiado: Dinheiro = Field(default=Decimal(0), ge=0)  # 0 = sem limite


class ClienteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    aceita_fiado: bool
    limite_fiado: Dinheiro


class PessoaIn(BaseModel):
    tipo: Literal["F", "J"]
    nome: str = Field(min_length=1, max_length=160)
    nome_fantasia: str | None = Field(default=None, max_length=160)
    documento: str | None = Field(default=None, max_length=20)
    telefone: str | None = Field(default=None, max_length=20)
    whatsapp: str | None = Field(default=None, max_length=20)
    email: EmailStr | None = None
    observacoes: str | None = Field(default=None, max_length=2000)
    ativo: bool = True
    papeis: list[PapelPessoa] = Field(min_length=1)
    enderecos: list[EnderecoIn] = []
    cliente: ClienteIn | None = None


class PessoaEditarIn(BaseModel):
    """PATCH: só os campos enviados mudam. `enderecos` e `papeis`, quando enviados, substituem a lista."""

    tipo: Literal["F", "J"] | None = None
    nome: str | None = Field(default=None, min_length=1, max_length=160)
    nome_fantasia: str | None = Field(default=None, max_length=160)
    documento: str | None = Field(default=None, max_length=20)
    telefone: str | None = Field(default=None, max_length=20)
    whatsapp: str | None = Field(default=None, max_length=20)
    email: EmailStr | None = None
    observacoes: str | None = Field(default=None, max_length=2000)
    ativo: bool | None = None
    papeis: list[PapelPessoa] | None = Field(default=None, min_length=1)
    enderecos: list[EnderecoIn] | None = None
    cliente: ClienteIn | None = None


class PessoaRapidaIn(BaseModel):
    nome: str = Field(min_length=1, max_length=160)
    telefone: str = Field(min_length=8, max_length=20)


class PessoaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tipo: str
    nome: str
    nome_fantasia: str | None
    documento: str | None
    telefone: str | None
    whatsapp: str | None
    email: str | None
    observacoes: str | None
    ativo: bool
    papeis: list[str]
    enderecos: list[EnderecoOut]
    cliente: ClienteOut | None
