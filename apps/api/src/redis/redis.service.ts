import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { createClient } from "redis";

const REDIS_PROBE_TIMEOUT_MS = 2_000;

type RedisClient = ReturnType<typeof createClient>;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly command: RedisClient;
  private readonly eventsSubscriber: RedisClient;
  private readonly adapterPublisher: RedisClient;
  private readonly adapterSubscriber: RedisClient;
  private connectPromise: Promise<void> | null = null;

  constructor() {
    const url = process.env.REDIS_URL?.trim();
    if (!url) throw new Error("REDIS_URL is required.");

    const options = {
      url,
      socket: {
        connectTimeout: REDIS_PROBE_TIMEOUT_MS,
        reconnectStrategy: (retries: number) => Math.min(100 * 2 ** Math.min(retries, 5), 3_000),
      },
    };
    this.command = createClient(options);
    this.eventsSubscriber = this.command.duplicate();
    this.adapterPublisher = this.command.duplicate();
    this.adapterSubscriber = this.command.duplicate();

    for (const client of this.clients) {
      client.on("error", (error) => {
        this.logger.error(`Redis connection error: ${error.message}`);
      });
    }
  }

  private get clients(): RedisClient[] {
    return [
      this.command,
      this.eventsSubscriber,
      this.adapterPublisher,
      this.adapterSubscriber,
    ];
  }

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async connect(): Promise<void> {
    if (!this.connectPromise) {
      this.connectPromise = Promise.all(
        this.clients.map(async (client) => {
          if (!client.isOpen) await client.connect();
        }),
      ).then(() => undefined);
      this.connectPromise.catch(() => undefined);
    }

    try {
      await Promise.race([
        this.connectPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Redis startup probe timed out")), REDIS_PROBE_TIMEOUT_MS),
        ),
      ]);
    } catch (error) {
      this.logger.error(
        `Redis unavailable during startup; readiness will fail closed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled(
      this.clients.map(async (client) => {
        if (client.isOpen) await client.close();
      }),
    );
  }

  async isReady(): Promise<boolean> {
    if (this.clients.some((client) => !client.isReady)) return false;
    try {
      await Promise.race([
        this.command.ping(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Redis readiness probe timed out")), REDIS_PROBE_TIMEOUT_MS),
        ),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  get commandClient(): RedisClient {
    return this.command;
  }

  get eventSubscriber(): RedisClient {
    return this.eventsSubscriber;
  }

  get adapterClients(): { publisher: RedisClient; subscriber: RedisClient } {
    return { publisher: this.adapterPublisher, subscriber: this.adapterSubscriber };
  }
}
