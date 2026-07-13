import { Module } from "@nestjs/common";

import { RedisRateLimiter } from "./redis-rate-limiter.service";
import { RedisModule } from "../redis/redis.module";

@Module({
  imports: [RedisModule],
  providers: [RedisRateLimiter, { provide: "RateLimiter", useExisting: RedisRateLimiter }],
  exports: [RedisRateLimiter, "RateLimiter"],
})
export class RateLimitModule {}
