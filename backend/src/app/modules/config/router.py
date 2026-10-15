from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.audit import Acao, registrar, snapshot
from app.core.db import get_db
from app.core.deps import AuthContext, autenticado, exigir_permissao
from app.modules.config.models import ConfiguracaoEmpresa
from app.modules.config.schemas import ConfiguracaoEditarIn, ConfiguracaoOut, EmpresaOut, PixOut

# Campos que `null` ou texto vazio apagam; ausente no corpo não mexe.
CAMPOS_APAGAVEIS = ("cnpj", "telefone", "endereco", "email_contato", "pix_copia_e_cola")

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
    for campo in CAMPOS_APAGAVEIS:
        if campo in dados.model_fields_set:
            # O Pix é para onde o dinheiro vai: a mudança sai na auditoria (antes e depois) como as demais.
            setattr(cfg, campo, getattr(dados, campo))
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


@router.get("/pix", response_model=PixOut)
def obter_pix(
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("comandas.fechar")),
) -> PixOut:
    """Pix da empresa para o fechamento da conta: o caixa monta o QR do valor sem abrir as configurações."""
    return PixOut.model_validate(db.get_one(ConfiguracaoEmpresa, 1))


@router.get("/empresa", response_model=EmpresaOut)
def obter_empresa(
    db: Session = Depends(get_db),
    _: AuthContext = Depends(autenticado),
) -> EmpresaOut:
    """Dados da empresa para o cabeçalho do recibo: não exige permissão de configurações."""
    return EmpresaOut.model_validate(db.get_one(ConfiguracaoEmpresa, 1))
