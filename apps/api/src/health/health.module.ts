import { Module } from "@nestjs/common";

import { DbModule } from "../db";
import { HealthController } from "./health.controller";
import { RedisModule } from "../redis/redis.module";

@Module({
  imports: [DbModule, RedisModule],
  controllers: [HealthController],
})
export class HealthModule {}
