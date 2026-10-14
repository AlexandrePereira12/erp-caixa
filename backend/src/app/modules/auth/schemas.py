from pydantic import BaseModel, Field


class LoginIn(BaseModel):
    email: str = Field(min_length=1, max_length=254)
    senha: str = Field(min_length=1, max_length=128)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105 (tipo do esquema HTTP, não é segredo)
    expires_in: int
    must_change_password: bool


class MeOut(BaseModel):
    id: int
    nome: str
    email: str
    papeis: list[str]
    permissoes: list[str]
    must_change_password: bool


class TrocaSenhaIn(BaseModel):
    senha_atual: str = Field(min_length=1, max_length=128)
    nova_senha: str = Field(min_length=1, max_length=128)
