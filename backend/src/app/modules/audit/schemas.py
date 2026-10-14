from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class AuditoriaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ocorrido_em: datetime
    usuario_id: int | None
    usuario_nome: str | None
    papel: str | None
    ip: str | None
    user_agent: str | None
    request_id: str | None
    acao: str
    modulo: str
    recurso: str
    recurso_id: str | None
    descricao: str
    antes: dict[str, Any] | None
    depois: dict[str, Any] | None
    campos_alterados: list[str] | None
