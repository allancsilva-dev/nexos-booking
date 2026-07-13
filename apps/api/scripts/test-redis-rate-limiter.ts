import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { createClient } from "redis";

import { DependencyUnavailableException } from "../src/common/exceptions/dependency-unavailable.exception";
import { RedisRateLimiter } from "../src/rate-limit/redis-rate-limiter.service";
import { RedisService } from "../src/redis/redis.service";

process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.RATE_LIMIT_KEY_SECRET ??= "test-rate-limit-key-secret-at-least-32-characters";
process.env.REDIS_KEY_PREFIX ??= "nexos:test";

async function main() {
  const firstRedis = new RedisService();
  const secondRedis = new RedisService();
  const first = new RedisRateLimiter(firstRedis);
  const second = new RedisRateLimiter(secondRedis);
  await Promise.all([firstRedis.onModuleInit(), secondRedis.onModuleInit()]);
  assert.equal(await first.isReady(), true, "Redis must be ready");

  const logicalKey = `login:email:sensitive-${randomUUID()}@example.com`;
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      (index % 2 === 0 ? first : second).consume(logicalKey, 5, 2_000),
    ),
  );
  assert.equal(results.filter((result) => result.allowed).length, 5);
  assert.equal(results.at(-1)?.remaining, 0);

  const inspector = createClient({ url: process.env.REDIS_URL });
  await inspector.connect();
  const keys = await inspector.keys(`${process.env.REDIS_KEY_PREFIX}:rate:*`);
  assert.ok(keys.length > 0);
  assert.ok(keys.every((key) => !key.includes("example.com") && /^[^:]+:[^:]+:rate:[a-f0-9]{64}$/u.test(key)));
  await inspector.close();

  const resetKey = `reset:${randomUUID()}`;
  assert.equal((await first.consume(resetKey, 1, 100)).allowed, true);
  assert.equal((await second.consume(resetKey, 1, 100)).allowed, false);
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal((await second.consume(resetKey, 1, 100)).allowed, true);

  await firstRedis.onModuleDestroy();
  await assert.rejects(
    () => first.consume(`closed:${randomUUID()}`, 1, 1_000),
    DependencyUnavailableException,
  );
  await secondRedis.onModuleDestroy();
  console.log("Redis rate limiter: PASS");
}

void main();
