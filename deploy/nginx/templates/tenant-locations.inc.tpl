# Rotas da empresa ${SLUG} (incluído pelo server de ${HOST}).
set $api_upstream http://${SLUG}_api:8000;
set $web_upstream http://${SLUG}_web:8080;

# Documentação interativa da API não é exposta pela internet.
location ~ ^/api/v1/(docs|openapi\.json) { return 404; }

location = /api/v1/auth/login {
    limit_req zone=login burst=20 nodelay;
    limit_req_status 429;
    include /etc/nginx/snippets/proxy.conf;
    proxy_pass $api_upstream;
}

location ~ ^/api/v1/auth/(change-password|refresh)$ {
    limit_req zone=sessao burst=20 nodelay;
    limit_req_status 429;
    include /etc/nginx/snippets/proxy.conf;
    proxy_pass $api_upstream;
}

location /api/ {
    include /etc/nginx/snippets/proxy.conf;
    proxy_pass $api_upstream;
}

location / {
    include /etc/nginx/snippets/proxy.conf;
    proxy_pass $web_upstream;
}
