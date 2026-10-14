from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class PapelResumo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str


class UsuarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    email: str
    suspenso: bool
    must_change_password: bool
    ultimo_login_em: datetime | None
    created_at: datetime
    papeis: list[PapelResumo]


class UsuarioCriarIn(BaseModel):
    nome: str = Field(min_length=1, max_length=120)
    email: EmailStr
    senha_temporaria: str = Field(min_length=1, max_length=128)
    papeis: list[int] = Field(min_length=1)


class UsuarioEditarIn(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=120)
    email: EmailStr | None = None
    papeis: list[int] | None = Field(default=None, min_length=1)


class RedefinirSenhaIn(BaseModel):
    senha_temporaria: str = Field(min_length=1, max_length=128)
