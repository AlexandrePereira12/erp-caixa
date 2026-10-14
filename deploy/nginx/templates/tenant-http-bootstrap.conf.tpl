# ${HOST} — só HTTP, enquanto o certificado ainda não existe (emissão HTTP-01).
server {
    listen 80;
    server_name ${HOST};
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 404; }
}
