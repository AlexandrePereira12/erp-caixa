# Contexto de build: raiz do repositório (precisa de frontend/ e deploy/images/):
#   docker buildx build -f deploy/images/web.Dockerfile -t sistema-pdv-web:TAG .
FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.22.0 --activate
WORKDIR /src
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ .
RUN pnpm build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY deploy/images/web-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
