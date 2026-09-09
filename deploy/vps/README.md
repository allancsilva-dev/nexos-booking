# Deploy VPS Hostinger

> **Stack em produção hoje: `docker-compose.prod.yml`.**
> Ela sobe apenas `web`, `api` e `postgres-backup`, ligando-se ao Postgres
> **externo** `dbnexos-booking` (gerido fora deste repositório) e ao
> `nginx-proxy-manager` já existente na VPS pela rede `proxy`.
> `docker-compose.vps.yml` é a stack **legada/de teste**: ela sobe o próprio
> Postgres, Nginx e Certbot e **não deve ser usada na VPS atual** — subiria um
> segundo banco e disputaria as portas 80/443 com o nginx-proxy-manager.
>
> Para aplicar migrations na produção real, use o modo de banco externo:
>
> ```sh
> DB_CONTAINER=dbnexos-booking sh deploy/vps/apply-migrations.sh
> ```

Arquivos:

- `docker-compose.prod.yml`: stack de produção (web + api + backup, banco externo).
- `docker-compose.vps.yml`: stack legada/de teste, com banco e Nginx próprios.
- `deploy/vps/nginx.conf.template`: proxy HTTP→HTTPS via Nginx (renderizado com `${DOMAIN}`).
- `deploy/vps/.env.vps.example`: modelo de secrets/env.
- `deploy/vps/apply-migrations.sh`: bootstrap `app_runtime` (com grants DML) e migrations.
- `deploy/vps/init-letsencrypt.sh`: emissão inicial do certificado TLS.

## Containers

- `NexosBooking-Web`: Next.js, porta interna `3020`, host `3020`.
- `NexosBooking-Api`: NestJS, porta interna `3001`, host `3023`.
- `dbnexos-booking`: PostgreSQL 17, volume `dbnexos-booking_postgres_data`.
- `NexosBooking-Nginx`: entrada pública `80`/`443`, proxy para API/WEB/WebSocket + TLS.
- `NexosBooking-Certbot`: renovação automática do certificado Let's Encrypt (loop a cada 12h).
- `NexosBooking-Postgres-Backup`: `pg_dump -Fc` diário em `./backups/postgres`.

Redis não é necessário para um único container de API. WebSocket atual usa Socket.IO em memória. Redis passa a ser necessário se escalar `NexosBooking-Api` para mais de 1 réplica ou mover eventos para fila distribuída.

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

Na produção atual (banco externo), o equivalente é:

```sh
DB_CONTAINER=dbnexos-booking sh deploy/vps/apply-migrations.sh
```

`DB_ENV_FILE` (padrão `.env.production`) é de onde o script lê
`APP_RUNTIME_PASSWORD`, que o container do banco externo não carrega.

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
- `3020/tcp`: Web direto, quando usado sem Nginx.
- `3023/tcp`: API direta, quando usada sem Nginx.

Não expor `5432`, `3000`, `3001`.

## Limites conhecidos

- Script de migrations criado para banco novo de teste. Ele registra arquivos em `schema_migrations` depois da primeira execução.
- Se banco já tiver migrations aplicadas manualmente sem `schema_migrations`, alinhar estado antes.
- `POSTGRES_SSL_MODE=disable` é correto para Postgres dentro da mesma rede Docker. Para banco externo gerenciado, usar `POSTGRES_SSL_MODE=require` e `POSTGRES_CA_CERT` se necessário.
