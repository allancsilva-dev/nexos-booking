import type { INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { ServerOptions } from "socket.io";

import { RedisService } from "../redis/redis.service";

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplicationContext,
    private readonly redis: RedisService,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    await this.redis.connect();
    const { publisher, subscriber } = this.redis.adapterClients;
    this.adapterConstructor = createAdapter(publisher, subscriber);
  }

  override createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options);
    if (!this.adapterConstructor) {
      throw new Error("Redis Socket.IO adapter was not initialized.");
    }
    server.adapter(this.adapterConstructor);
    return server;
  }
}
