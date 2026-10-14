# ${HOST} — empresa ${SLUG} (teste local, sem TLS)
server {
    listen 80;
    server_name ${HOST};

    include /etc/nginx/snippets/security-headers.conf;

    include /etc/nginx/sites-enabled/${SLUG}.inc;
}
