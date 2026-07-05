#!/usr/bin/env sh
# Emissão inicial do certificado Let's Encrypt para a stack VPS.
# Resolve o ovo-galinha (nginx :443 precisa de cert, certbot precisa de nginx :80):
# 1) cria cert dummy  2) sobe nginx  3) troca por cert real via webroot  4) reload.
# Rode UMA vez, depois que `api` e `web` já estiverem no ar. A renovação passa a ser
# automática pelo container `certbot`.
set -eu

COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-deploy/vps/.env.vps}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.vps.yml}"
DATA_PATH="./deploy/vps/certbot"
STAGING="${STAGING:-0}"   # STAGING=1 usa o ambiente de teste do Let's Encrypt (sem rate limit)

compose() {
  docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

env_get() {
  grep -E "^$1=" "$COMPOSE_ENV_FILE" | tail -n1 | cut -d= -f2-
}

DOMAIN="$(env_get DOMAIN)"
EMAIL="$(env_get LETSENCRYPT_EMAIL)"

[ -n "$DOMAIN" ] || { echo "ERRO: DOMAIN vazio em $COMPOSE_ENV_FILE"; exit 1; }
[ -n "$EMAIL" ]  || { echo "ERRO: LETSENCRYPT_EMAIL vazio em $COMPOSE_ENV_FILE"; exit 1; }

echo "Domínio: $DOMAIN"
echo "E-mail:  $EMAIL"

# 1. Parâmetros TLS recomendados pelo certbot (referenciados no nginx.conf.template)
if [ ! -e "$DATA_PATH/conf/options-ssl-nginx.conf" ] || [ ! -e "$DATA_PATH/conf/ssl-dhparams.pem" ]; then
  echo "Baixando parâmetros TLS recomendados..."
  mkdir -p "$DATA_PATH/conf"
  curl -fsSL https://raw.githubusercontent.com/certbot/certbot/main/certbot-nginx/src/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf \
    > "$DATA_PATH/conf/options-ssl-nginx.conf"
  curl -fsSL https://raw.githubusercontent.com/certbot/certbot/main/certbot/certbot/ssl-dhparams.pem \
    > "$DATA_PATH/conf/ssl-dhparams.pem"
fi

# 2. Cert dummy só pra o nginx conseguir abrir o :443
echo "Criando certificado dummy para $DOMAIN..."
mkdir -p "$DATA_PATH/conf/live/$DOMAIN"
compose run --rm --entrypoint sh certbot -c "\
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout '/etc/letsencrypt/live/$DOMAIN/privkey.pem' \
    -out    '/etc/letsencrypt/live/$DOMAIN/fullchain.pem' \
    -subj '/CN=localhost'"

# 3. Sobe o nginx (com o cert dummy) — também sobe api/web/postgres se preciso
echo "Subindo nginx..."
compose up -d nginx

# 4. Remove o dummy antes de pedir o real
echo "Removendo certificado dummy..."
compose run --rm --entrypoint sh certbot -c "\
  rm -Rf /etc/letsencrypt/live/$DOMAIN && \
  rm -Rf /etc/letsencrypt/archive/$DOMAIN && \
  rm -Rf /etc/letsencrypt/renewal/$DOMAIN.conf"

# 5. Pede o certificado real (webroot: nginx serve /.well-known/acme-challenge)
echo "Solicitando certificado Let's Encrypt..."
STAGING_ARG=""
[ "$STAGING" != "0" ] && STAGING_ARG="--staging"
compose run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  $STAGING_ARG \
  --email "$EMAIL" \
  -d "$DOMAIN" \
  --rsa-key-size 4096 \
  --agree-tos \
  --no-eff-email \
  --force-renewal

# 6. Recarrega o nginx com o cert válido e liga a renovação automática
echo "Recarregando nginx..."
compose exec nginx nginx -s reload
compose up -d certbot

echo "Pronto. HTTPS ativo em https://$DOMAIN"
