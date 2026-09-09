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
- `deploy/vps/deploy.sh`: deploy da stack de produção (build, reload do proxy e verificação).
- `deploy/vps/init-letsencrypt.sh`: emissão inicial do certificado TLS (só na stack legada).

## Containers

Stack de produção (`docker-compose.prod.yml`):

- `NexosBooking-Web`: Next.js na porta `3020`. **Sem porta publicada no host** — só alcançável pelas redes Docker.
- `NexosBooking-Api`: NestJS na porta `3023`. **Sem porta publicada no host.**
- `NexosBooking-Redis`: rate limit e adapter do Socket.IO. Efêmero, sem persistência.
- `NexosBooking-Backup`: `pg_dump -Fc` diário em `./backups/postgres`, retenção de 7 dias.
- `dbnexos-booking`: PostgreSQL 17, **externo a este repositório**, publicado apenas em `127.0.0.1`.

A entrada pública é o `nginx-proxy-manager`, que já existe na VPS e serve também
os outros sistemas. Ele encaminha `/socket.io` direto para `NexosBooking-Api` e
**todo o resto para `NexosBooking-Web`** — inclusive `/api/v1/*`, que chega à API
pelo `rewrite` do `apps/web/next.config.ts`. `NexosBooking-Nginx` e
`NexosBooking-Certbot` existem apenas na stack legada `docker-compose.vps.yml`.

> **Redis é obrigatório.** O `RedisService` é instanciado no bootstrap e lança
> `REDIS_URL is required.`: sem essa variável a API não sobe. A afirmação
> anterior de que Redis era dispensável para uma única réplica não vale mais.

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

Na produção atual, **use sempre o script** — não o `docker compose` cru:

```sh
sh deploy/vps/deploy.sh
```

Ele constrói as imagens, espera `api` e `web` ficarem healthy, recarrega o
nginx do proxy e verifica `web`, `api` e `socket.io`.

> **Por que o reload é obrigatório.** O nginx resolve `NexosBooking-Api` uma
> única vez, no load da configuração, e guarda o IP. Todo deploy que recria o
> container da API lhe dá um IP novo na rede `proxy`, e o nginx segue tentando
> o antigo: `/socket.io` passa a responder **502 e o realtime morre**. A falha
> é silenciosa — os healthchecks continuam verdes, porque testam a API por
> dentro do container. Por isso a verificação faz parte do script.

Na stack legada (`docker-compose.vps.yml`), o equivalente é:

```sh
docker compose --env-file deploy/vps/.env.vps -f docker-compose.vps.yml up -d --build api web
```

3. Emite o certificado e ativa o HTTPS (rode uma vez):

> **Só na stack legada.** Na produção atual o TLS é do `nginx-proxy-manager`,
> que já detém as portas 80/443 e renova os certificados sozinho. Rodar este
> script na VPS atual subiria um Nginx concorrente e disputaria a porta 80,
> derrubando os outros sistemas.

```sh
COMPOSE_ENV_FILE=deploy/vps/.env.vps sh deploy/vps/init-letsencrypt.sh
```

> Teste do fluxo TLS sem gastar cota do Let's Encrypt: `STAGING=1 COMPOSE_ENV_FILE=deploy/vps/.env.vps sh deploy/vps/init-letsencrypt.sh` (depois rode de novo sem `STAGING` para o cert válido).

Verifique:

```sh
docker compose -f docker-compose.prod.yml ps
curl -sI https://SEU_DOMINIO/                       # web: 200
curl -sI https://SEU_DOMINIO/api/v1/auth/me         # api: 401 (sem token)
curl -sI "https://SEU_DOMINIO/socket.io/?EIO=4&transport=polling"   # realtime: 200
```

> `/health` e `/ready` **não** servem para verificar a API pelo domínio público:
> o proxy manda esses caminhos para o app web, que responde o próprio HTML. Os
> healthchecks da API rodam dentro do container.

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
