import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";

import { createAdapter } from "@socket.io/redis-adapter";
import { Server } from "socket.io";
import { io as createClient } from "socket.io-client";

import { RedisService } from "../src/redis/redis.service";
import { KickService } from "../src/realtime/kick.service";
import { RedisRealtimeTransport } from "../src/realtime/redis-realtime.transport";

process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.REDIS_KEY_PREFIX ??= `nexos:test:realtime:${process.pid}`;

async function listen(server: ReturnType<typeof createServer>): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server has no TCP port");
  return address.port;
}

async function main(): Promise<void> {
  const redisA = new RedisService();
  const redisB = new RedisService();
  await Promise.all([redisA.connect(), redisB.connect()]);
  assert.equal(await redisA.isReady(), true);
  assert.equal(await redisB.isReady(), true);

  const httpA = createServer();
  const httpB = createServer();
  const ioA = new Server(httpA);
  const ioB = new Server(httpB);
  const adapterA = redisA.adapterClients;
  const adapterB = redisB.adapterClients;
  ioA.adapter(createAdapter(adapterA.publisher, adapterA.subscriber));
  ioB.adapter(createAdapter(adapterB.publisher, adapterB.subscriber));

  const transportA = new RedisRealtimeTransport(redisA);
  const transportB = new RedisRealtimeTransport(redisB);
  transportA.setServer(ioA);
  transportB.setServer(ioB);
  await Promise.all([transportA.onModuleInit(), transportB.onModuleInit()]);

  const organizationId = "11111111-1111-4111-8111-111111111111";
  const professionalId = "22222222-2222-4222-8222-222222222222";
  const sid = "33333333-3333-4333-8333-333333333333";
  ioB.on("connection", (socket) => {
    void socket.join([`org:${organizationId}`, `session:${sid}`]);
  });

  const portB = await listen(httpB);
  await listen(httpA);
  const client = createClient(`http://127.0.0.1:${portB}`, { transports: ["websocket"] });
  await once(client, "connect");

  const received = once(client, "appointment.changed");
  await transportA.publish({
    appointmentId: "44444444-4444-4444-8444-444444444444",
    professionalId,
    eventType: "CREATED",
    date: "2026-07-13",
    version: 1,
    occurredAt: "2026-07-13T12:00:00.000Z",
    organizationId,
  });
  const [event] = await received;
  assert.equal(event.appointmentId, "44444444-4444-4444-8444-444444444444");
  assert.equal("clientName" in event, false, "realtime payload must not contain PII");

  const disconnected = once(client, "disconnect");
  const kick = new KickService();
  kick.setServer(ioA);
  kick.kickBySid(sid);
  const [reason] = await disconnected;
  assert.equal(reason, "io server disconnect", "cross-node kick must reach remote socket");

  client.close();
  await Promise.all([transportA.onModuleDestroy(), transportB.onModuleDestroy()]);
  await Promise.all([ioA.close(), ioB.close()]);
  await Promise.all([redisA.onModuleDestroy(), redisB.onModuleDestroy()]);
  console.log("Distributed realtime event and cross-node session kick: PASS");
}

void main();
