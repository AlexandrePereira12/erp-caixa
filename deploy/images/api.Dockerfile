# Contexto de build: backend/   (docker buildx build -f deploy/images/api.Dockerfile backend)
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependências travadas primeiro: camada reaproveitada enquanto o lock não mudar.
COPY requirements.lock .
RUN pip install -r requirements.lock

COPY pyproject.toml alembic.ini ./
COPY src ./src
COPY migrations ./migrations
RUN pip install --no-deps . && rm -rf src build ./*.egg-info

RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin app
USER 10001

EXPOSE 8000
HEALTHCHECK --interval=5s --timeout=3s --start-period=20s --retries=3 \
    CMD ["python", "-c", "import urllib.request as u; u.urlopen('http://127.0.0.1:8000/api/v1/health', timeout=2)"]

# IP real/X-Request-ID são tratados pelo ContextoMiddleware (só vale do proxy confiável),
# por isso o tratamento de proxy do uvicorn fica desligado.
CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", \
     "--workers", "2", "--no-proxy-headers", "--no-access-log"]
