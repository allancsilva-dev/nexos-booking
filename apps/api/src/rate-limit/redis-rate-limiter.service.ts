import { createHmac } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";

import { DependencyUnavailableException } from "../common/exceptions/dependency-unavailable.exception";
import type {
  RateLimiter,
  RateLimitResult,
} from "../auth/rate-limit/rate-limiter.interface";
import { RedisService } from "../redis/redis.service";

const RATE_LIMIT_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
if ttl < 0 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

@Injectable()
export class RedisRateLimiter implements RateLimiter {
  private readonly logger = new Logger(RedisRateLimiter.name);
  private readonly secret: string;
  private readonly prefix: string;

  constructor(@Inject(RedisService) private readonly redis: RedisService) {
    const secret = process.env.RATE_LIMIT_KEY_SECRET?.trim();
    if (!secret || secret.length < 32) {
      throw new Error("RATE_LIMIT_KEY_SECRET must be at least 32 characters.");
    }

    this.secret = secret;
    const basePrefix = process.env.REDIS_KEY_PREFIX?.trim() || `nexos:${process.env.NODE_ENV ?? "development"}`;
    this.prefix = `${basePrefix}:rate`;
  }

  async isReady(): Promise<boolean> {
    return this.redis.isReady();
  }

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const client = this.redis.commandClient;
    if (!client.isReady) {
      throw new DependencyUnavailableException("Rate limit service");
    }

    const digest = createHmac("sha256", this.secret).update(key).digest("hex");
    try {
      const raw = await client.eval(RATE_LIMIT_SCRIPT, {
        keys: [`${this.prefix}:${digest}`],
        arguments: [String(windowMs)],
      });
      const [count, ttl] = raw as [number, number];
      const now = Date.now();
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        resetAt: now + Math.max(0, ttl),
      };
    } catch (error) {
      this.logger.error(
        `Redis rate-limit operation failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      throw new DependencyUnavailableException("Rate limit service");
    }
  }
}
