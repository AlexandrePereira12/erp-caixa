from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.audit import Acao, registrar, snapshot
from app.core.db import get_db
from app.core.deps import AuthContext, exigir_permissao
from app.modules.config.models import ConfiguracaoEmpresa
from app.modules.config.schemas import ConfiguracaoEditarIn, ConfiguracaoOut

router = APIRouter(prefix="/configuracoes", tags=["configuracoes"])


@router.get("", response_model=ConfiguracaoOut)
def obter(
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("configuracoes.ver")),
) -> ConfiguracaoOut:
    return ConfiguracaoOut.model_validate(db.get_one(ConfiguracaoEmpresa, 1))


@router.patch("", response_model=ConfiguracaoOut)
def editar(
    dados: ConfiguracaoEditarIn,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("configuracoes.editar")),
) -> ConfiguracaoOut:
    cfg = db.get_one(ConfiguracaoEmpresa, 1)
    antes = snapshot(cfg)
    if dados.nome_exibicao is not None:
        cfg.nome_exibicao = dados.nome_exibicao.strip()
    if dados.timezone is not None:
        cfg.timezone = dados.timezone
    if dados.taxa_servico_pct is not None:
        cfg.taxa_servico_pct = dados.taxa_servico_pct
    if dados.cancelamento_janela_min is not None:
        cfg.cancelamento_janela_min = dados.cancelamento_janela_min
    db.flush()
    registrar(
        db,
        Acao.UPDATE,
        "configuracoes",
        "configuracao_empresa",
        1,
        "Configurações da empresa atualizadas.",
        antes=antes,
        depois=snapshot(cfg),
    )
    db.commit()
    return ConfiguracaoOut.model_validate(cfg)
