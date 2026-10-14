"""Comandos de operação, rodados pelos scripts de deploy.

python -m app.cli bootstrap                      # permissões, papéis e configuração
python -m app.cli create-admin --email E --nome N  # senha lida da entrada padrão
"""

import argparse
import json
import sys

from sqlalchemy import func, select

from app.core.audit import Acao, registrar
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.core.security import hash_senha, validar_politica_senha
from app.modules.config.models import ConfiguracaoEmpresa
from app.modules.rbac import service as rbac
from app.modules.rbac.catalog import ADMINISTRADOR
from app.modules.rbac.models import Papel
from app.modules.users.models import Usuario


def bootstrap() -> None:
    s = get_settings()
    with get_sessionmaker()() as db:
        rbac.sincronizar(db)
        if db.get(ConfiguracaoEmpresa, 1) is None:
            db.add(ConfiguracaoEmpresa(id=1, nome_exibicao=s.empresa_nome, timezone=s.timezone))
            db.commit()


def create_admin(email: str, nome: str, senha: str) -> None:
    erro = validar_politica_senha(senha, email)
    if erro:
        raise SystemExit(erro)
    email = email.strip().lower()
    with get_sessionmaker()() as db:
        if db.scalar(
            select(Usuario.id).where(
                func.lower(Usuario.email) == email, Usuario.deleted_at.is_(None)
            )
        ):
            raise SystemExit(f"Já existe usuário com o e-mail {email}.")
        papel = db.scalar(select(Papel).where(Papel.nome == ADMINISTRADOR, Papel.sistema.is_(True)))
        if papel is None:
            raise SystemExit("Papel Administrador ausente: rode `bootstrap` antes.")
        u = Usuario(
            nome=nome.strip(),
            email=email,
            senha_hash=hash_senha(senha),
            must_change_password=True,
            papeis=[papel],
        )
        db.add(u)
        db.flush()
        registrar(
            db,
            Acao.CREATE,
            "usuarios",
            "usuario",
            u.id,
            f"Administrador inicial {u.nome} criado pela linha de comando.",
            depois={"nome": u.nome, "email": u.email, "papeis": [papel.nome]},
            usuario_nome="cli",
            papel="sistema",
        )
        db.commit()


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="app.cli")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("bootstrap")
    ca = sub.add_parser("create-admin")
    ca.add_argument("--email", required=True)
    ca.add_argument("--nome", required=True)
    sub.add_parser("openapi")
    sub.add_parser("seed-demo")
    args = p.parse_args(argv)

    if args.cmd == "bootstrap":
        bootstrap()
    elif args.cmd == "openapi":
        from app.main import create_app

        print(json.dumps(create_app().openapi(), ensure_ascii=False, indent=2, sort_keys=True))
    elif args.cmd == "seed-demo":
        from app.seed_demo import semear

        with get_sessionmaker()() as db:
            print(
                "dados de demonstração criados"
                if semear(db)
                else "empresa já tem produtos: nada feito"
            )
    elif args.cmd == "create-admin":
        senha = sys.stdin.readline().rstrip("\n")
        create_admin(args.email, args.nome, senha)


if __name__ == "__main__":
    main()
