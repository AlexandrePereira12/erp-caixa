from fastapi import APIRouter, Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import RESPOSTAS_DE_ERRO, AppError, registrar_handlers
from app.core.logging import configurar_logging
from app.core.middleware import ContextoMiddleware
from app.modules.audit.router import router as audit_router
from app.modules.auth.router import router as auth_router
from app.modules.cash.router import router as cash_router
from app.modules.catalog.router import router as catalog_router
from app.modules.config.router import router as config_router
from app.modules.finance.router import router as finance_router
from app.modules.inventory.router import router as inventory_router
from app.modules.orders.router import router as orders_router
from app.modules.payables.router import router as payables_router
from app.modules.people.router import router as people_router
from app.modules.rbac.router import router as rbac_router
from app.modules.reports.router import router as reports_router
from app.modules.sales.router import router as sales_router
from app.modules.tables.router import router as tables_router
from app.modules.users.router import router as users_router

API_PREFIX = "/api/v1"

publico = APIRouter(tags=["saude"])


@publico.get("/health")
def health(db: Session = Depends(get_db)) -> dict[str, str]:
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        raise AppError(503, "banco_indisponivel", "Banco de dados indisponível.") from exc
    return {"status": "ok"}


# Todos os routers da API. Os testes de política de acesso partem desta lista.
ROUTERS = (
    publico,
    auth_router,
    users_router,
    rbac_router,
    audit_router,
    config_router,
    people_router,
    catalog_router,
    inventory_router,
    tables_router,
    orders_router,
    cash_router,
    sales_router,
    finance_router,
    payables_router,
    reports_router,
)


def create_app() -> FastAPI:
    settings = get_settings()
    configurar_logging()
    app = FastAPI(
        title=f"{settings.empresa_nome} — API",
        version="0.1.0",
        docs_url=f"{API_PREFIX}/docs",
        openapi_url=f"{API_PREFIX}/openapi.json",
        redoc_url=None,
        responses=RESPOSTAS_DE_ERRO,
    )
    registrar_handlers(app)
    app.add_middleware(ContextoMiddleware, redes_confiaveis=settings.trusted_proxy_networks)

    for r in ROUTERS:
        app.include_router(r, prefix=API_PREFIX)
    return app
