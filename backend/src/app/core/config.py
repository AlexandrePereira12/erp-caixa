import ipaddress
from functools import lru_cache
from zoneinfo import ZoneInfo

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuração da instalação de UMA empresa (lida do .env do tenant)."""

    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    empresa_nome: str = "Empresa"
    empresa_slug: str = "empresa"
    app_url: str = "http://localhost"

    # Credencial do role app (sem UPDATE/DELETE nas tabelas append-only).
    database_url: str
    # Credencial do owner: usada só pelo container de migration.
    database_owner_url: str | None = None

    jwt_secret: str = Field(min_length=32)
    timezone: str = "America/Fortaleza"

    access_token_minutes: int = Field(default=15, ge=1, le=120)
    refresh_token_days: int = Field(default=14, ge=1, le=90)
    cookie_secure: bool = True

    # Nenhuma requisição fica presa para sempre esperando trava ou consulta.
    db_lock_timeout_ms: int = Field(default=5_000, ge=100)
    db_statement_timeout_ms: int = Field(default=30_000, ge=1_000)
    db_idle_in_transaction_timeout_ms: int = Field(default=60_000, ge=1_000)

    # CIDRs dos proxies confiáveis (rede _edge da empresa). Vazio = não confia em nenhum
    # cabeçalho de IP/X-Request-ID e usa sempre o par TCP.
    trusted_proxy_cidrs: str = ""

    @field_validator("timezone")
    @classmethod
    def _valida_timezone(cls, v: str) -> str:
        ZoneInfo(v)
        return v

    @property
    def trusted_proxy_networks(self) -> list[ipaddress.IPv4Network | ipaddress.IPv6Network]:
        return [
            ipaddress.ip_network(c.strip(), strict=False)
            for c in self.trusted_proxy_cidrs.split(",")
            if c.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
