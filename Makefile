# Atalhos de desenvolvimento. Pré-requisitos: python3.12, docker, pnpm (node 20+).
VENV      := backend/.venv
PY        := $(VENV)/bin/python
COMPOSE_T := docker compose -f deploy/dev/compose.test.yml

.PHONY: help setup db-test-up db-test-down test lint format openapi build-api build-web isolamento e2e dev dev-db dev-api dev-web

help:
	@grep -E '^[a-z-]+:' Makefile | cut -d: -f1 | tr '\n' ' '; echo

setup: $(VENV)/bin/python
	$(VENV)/bin/pip install -q -e 'backend[dev]'
	pnpm --dir frontend install --frozen-lockfile

$(VENV)/bin/python:
	python3 -m venv $(VENV)

db-test-up:
	$(COMPOSE_T) up -d --wait

db-test-down:
	$(COMPOSE_T) down -v

test: db-test-up
	cd backend && .venv/bin/python -m pytest -q

lint:
	cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check .

format:
	cd backend && .venv/bin/ruff format .

# Contrato da API usado para gerar os tipos do frontend (não precisa de banco).
openapi:
	cd backend && DATABASE_URL=postgresql+psycopg://x:x@localhost/x JWT_SECRET=openapi-export-apenas-placeholder-sem-segredo \
		.venv/bin/python -m app.cli openapi > ../frontend/openapi.json

build-api:
	docker buildx build -f deploy/images/api.Dockerfile -t sistema-pdv-api:dev backend

build-web:
	docker buildx build -f deploy/images/web.Dockerfile -t sistema-pdv-web:dev .

# Prova isolamento entre empresas, backup/restauração e atualização com 2 empresas locais.
isolamento: build-api build-web
	bash deploy/scripts/testar-isolamento.sh

# Playwright contra uma empresa local com dados de demonstração.
e2e: build-api build-web
	bash deploy/scripts/e2e.sh

# Desenvolvimento local: `make dev-db` (uma vez) e depois `make dev` (api + web) ou dev-api/dev-web em terminais separados.
dev-db:
	deploy/dev/dev.sh db

dev-api:
	deploy/dev/dev.sh api

dev-web:
	deploy/dev/dev.sh web

dev:
	deploy/dev/dev.sh tudo
