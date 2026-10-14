"""Fuso horário da empresa: a fonte única para interpretar datas sem fuso."""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.modules.config.models import ConfiguracaoEmpresa


def fuso_da_empresa(db: Session) -> ZoneInfo:
    return ZoneInfo(db.get_one(ConfiguracaoEmpresa, 1).timezone)


def para_utc(db: Session, instante: datetime | None) -> datetime | None:
    """Data/hora sem fuso (ex.: "2026-10-14" ou "2026-10-14T08:00") vale no fuso da EMPRESA, não em
    UTC. Com fuso explícito, só converte para UTC."""
    if instante is None:
        return None
    if instante.tzinfo is None:
        instante = instante.replace(tzinfo=fuso_da_empresa(db))
    return instante.astimezone(UTC)
