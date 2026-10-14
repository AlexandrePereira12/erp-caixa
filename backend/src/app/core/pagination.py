from fastapi import Query
from pydantic import BaseModel


class Page[T](BaseModel):
    itens: list[T]
    total: int
    limite: int
    deslocamento: int


class Paginacao:
    def __init__(
        self,
        limite: int = Query(50, ge=1, le=200),
        deslocamento: int = Query(0, ge=0, le=10_000_000),
    ) -> None:
        self.limite = limite
        self.deslocamento = deslocamento
