# ${HOST} — empresa ${SLUG}
server {
    listen 80;
    server_name ${HOST};
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    http2 on;
    server_name ${HOST};

    ssl_certificate     /etc/letsencrypt/live/${HOST}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${HOST}/privkey.pem;
    include /etc/nginx/snippets/tls.conf;
    include /etc/nginx/snippets/security-headers.conf;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    include /etc/nginx/sites-enabled/${SLUG}.inc;
}
