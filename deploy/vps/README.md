# Deploy VPS Hostinger

Arquivos:

- `docker-compose.vps.yml`: stack online para teste.
- `deploy/vps/nginx.conf.template`: proxy HTTP→HTTPS via Nginx (renderizado com `${DOMAIN}`).
- `deploy/vps/.env.vps.example`: modelo de secrets/env.
- `deploy/vps/apply-migrations.sh`: bootstrap `app_runtime` (com grants DML) e migrations.
- `deploy/vps/init-letsencrypt.sh`: emissão inicial do certificado TLS.

## Containers

- `booking-web`: Next.js, porta interna `3000`.
- `booking-api`: NestJS, porta interna `3001`.
- `booking-postgres`: PostgreSQL 17, volume `postgres_data`.
- `booking-nginx`: entrada pública `80`/`443`, proxy para API/WEB/WebSocket + TLS.
- `booking-certbot`: renovação automática do certificado Let's Encrypt (loop a cada 12h).
- `booking-postgres-backup`: `pg_dump -Fc` diário em `./backups/postgres`.

Redis não é necessário para um único container de API. WebSocket atual usa Socket.IO em memória. Redis passa a ser necessário se escalar `booking-api` para mais de 1 réplica ou mover eventos para fila distribuída.

## Pré-requisito de DNS

Aponte um registro **A** de `DOMAIN` (ex.: `booking.nexostech.com.br`) para o IP público da VPS **antes** de emitir o certificado. Sem DNS resolvendo, o desafio ACME falha.

## Primeira subida

```sh
cp deploy/vps/.env.vps.example deploy/vps/.env.vps
chmod 600 deploy/vps/.env.vps
```

Edite `deploy/vps/.env.vps`:

- `DOMAIN` e `LETSENCRYPT_EMAIL` (domínio real + e-mail para avisos de expiração).
- `PUBLIC_CANCEL_BASE_URL=https://SEU_DOMINIO/cancelar`.
- Troque `POSTGRES_PASSWORD`, `APP_RUNTIME_PASSWORD`, `JWT_SECRET` (≥32 bytes).

1. Banco + schema (cria `app_runtime` com grants DML e aplica migrations):

```sh
COMPOSE_ENV_FILE=deploy/vps/.env.vps sh deploy/vps/apply-migrations.sh
```

2. Sobe API e WEB (constrói as imagens):

```sh
docker compose --env-file deploy/vps/.env.vps -f docker-compose.vps.yml up -d --build api web
```

3. Emite o certificado e ativa o HTTPS (rode uma vez):

```sh
COMPOSE_ENV_FILE=deploy/vps/.env.vps sh deploy/vps/init-letsencrypt.sh
```

> Teste do fluxo TLS sem gastar cota do Let's Encrypt: `STAGING=1 COMPOSE_ENV_FILE=deploy/vps/.env.vps sh deploy/vps/init-letsencrypt.sh` (depois rode de novo sem `STAGING` para o cert válido).

Verifique:

```sh
docker compose --env-file deploy/vps/.env.vps -f docker-compose.vps.yml ps
curl -i https://SEU_DOMINIO/health
curl -i https://SEU_DOMINIO/api/v1/services
```

## Backup e restore

Backups ficam em `./backups/postgres/*.dump`.

Restore em banco vazio:

```sh
docker compose --env-file deploy/vps/.env.vps -f docker-compose.vps.yml exec -T postgres \
  sh -lc 'pg_restore --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < backups/postgres/ARQUIVO.dump
```

## Firewall VPS

Abrir:

- `22/tcp`: SSH.
- `80/tcp`: HTTP/Nginx (redireciona para HTTPS + serve o desafio ACME).
- `443/tcp`: HTTPS/Nginx (entrada real da aplicação).

Não expor `5432`, `3000`, `3001`.

## Limites conhecidos

- Script de migrations criado para banco novo de teste. Ele registra arquivos em `schema_migrations` depois da primeira execução.
- Se banco já tiver migrations aplicadas manualmente sem `schema_migrations`, alinhar estado antes.
- `POSTGRES_SSL_MODE=disable` é correto para Postgres dentro da mesma rede Docker. Para banco externo gerenciado, usar `POSTGRES_SSL_MODE=require` e `POSTGRES_CA_CERT` se necessário.
