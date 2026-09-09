#!/usr/bin/env sh
set -eu

# Deploy da stack de produção (docker-compose.prod.yml).
#
# POR QUE ESTE SCRIPT EXISTE, e não apenas um "docker compose up -d --build":
#
# O nginx do nginx-proxy-manager resolve "NexosBooking-Api" UMA vez, no load da
# configuração, e guarda o IP. Todo deploy que recria o container da API lhe dá
# um IP novo na rede "proxy", e o nginx continua tentando o IP antigo. O efeito
# é que /socket.io passa a responder 502 e o realtime morre — sem nenhum sinal
# nos healthchecks, que continuam verdes porque testam a API por dentro.
#
# Por isso o deploy precisa recarregar o nginx depois de subir a API, e depois
# CONFIRMAR que /socket.io voltou: a falha original era silenciosa, então o
# script trata a verificação como parte do deploy, não como passo opcional.

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
SERVICES="${SERVICES:-api web}"
# Todos precisam estar healthy ANTES do reload: o nginx resolve os upstreams no
# reload, e recarregar com um container ainda subindo devolve 502 ate ele
# comecar a escutar.
CONTAINERS="${CONTAINERS:-NexosBooking-Api NexosBooking-Web}"
PROXY_CONTAINER="${PROXY_CONTAINER:-nginx-proxy-manager}"
PUBLIC_URL="${PUBLIC_URL:-https://booking.nexostech.com.br}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"

echo "==> build e up ($SERVICES)"
# shellcheck disable=SC2086 # SERVICES e intencionalmente uma lista
docker compose -f "$COMPOSE_FILE" up -d --build $SERVICES

for container in $CONTAINERS; do
  echo "==> aguardando $container ficar healthy"
  waited=0
  while [ "$(docker inspect -f '{{.State.Health.Status}}' "$container" 2>/dev/null || echo missing)" != "healthy" ]; do
    waited=$((waited + 2))
    if [ "$waited" -ge "$HEALTH_TIMEOUT" ]; then
      echo "ERRO: $container nao ficou healthy em ${HEALTH_TIMEOUT}s" >&2
      exit 1
    fi
    sleep 2
  done
  echo "    healthy apos ${waited}s"
done

# O reload e gracioso: nao derruba conexoes e nao interrompe os outros sites
# servidos pelo mesmo proxy.
if docker ps --format '{{.Names}}' | grep -qx "$PROXY_CONTAINER"; then
  echo "==> reload do nginx em $PROXY_CONTAINER (re-resolve o IP da API)"
  docker exec "$PROXY_CONTAINER" nginx -s reload
else
  echo "==> $PROXY_CONTAINER ausente, reload dispensado"
fi

echo "==> verificando"
# Tenta algumas vezes antes de falhar: o proxy leva um instante para assentar
# apos o reload. Poucas tentativas de proposito — o objetivo e evitar alarme
# falso, nao mascarar um upstream realmente quebrado.
check() {
  label="$1"
  url="$2"
  expected="$3"
  attempt=1
  while [ "$attempt" -le 4 ]; do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$url" || echo 000)"
    if [ "$code" = "$expected" ]; then
      printf '    %-12s %s\n' "$label" "$code"
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 3
  done
  printf '    %-12s %s\n' "$label" "$code"
  echo "ERRO: $label esperava $expected e recebeu $code" >&2
  return 1
}

check "web" "$PUBLIC_URL/" 200
check "api" "$PUBLIC_URL/api/v1/auth/me" 401
# A verificacao que pega a regressao do IP em cache descrita acima.
check "socket.io" "$PUBLIC_URL/socket.io/?EIO=4&transport=polling" 200

echo "==> deploy concluido"
