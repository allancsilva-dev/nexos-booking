import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { AppointmentChangedEventSchema } from "@nexos/shared";
import type { Server } from "socket.io";

import { RedisService } from "../redis/redis.service";
import type { AppointmentEventPublisher, PublishedEvent } from "./publisher.interface";

const CHANNEL_SUFFIX = "appointment-events";

@Injectable()
export class RedisRealtimeTransport
  implements AppointmentEventPublisher, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RedisRealtimeTransport.name);
  private readonly channel: string;
  private server: Server | null = null;
  private subscribed = false;
  private subscribing = false;

  constructor(@Inject(RedisService) private readonly redis: RedisService) {
    const prefix = process.env.REDIS_KEY_PREFIX?.trim() || `nexos:${process.env.NODE_ENV ?? "development"}`;
    this.channel = `${prefix}:${CHANNEL_SUFFIX}`;
    this.redis.eventSubscriber.on("ready", () => void this.subscribe());
  }

  async onModuleInit(): Promise<void> {
    await this.subscribe();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscribed && this.redis.eventSubscriber.isOpen) {
      await this.redis.eventSubscriber.unsubscribe(this.channel);
    }
  }

  setServer(server: Server): void {
    this.server = server;
  }

  async publish(event: PublishedEvent): Promise<void> {
    if (!this.server || !(await this.redis.isReady())) {
      throw new Error("Distributed realtime transport is not ready.");
    }

    const subscribers = await this.redis.commandClient.publish(
      this.channel,
      JSON.stringify(event),
    );
    if (subscribers < 1) {
      throw new Error("Distributed realtime transport has no active subscribers.");
    }
  }

  private async subscribe(): Promise<void> {
    const subscriber = this.redis.eventSubscriber;
    if (this.subscribed || this.subscribing) return;
    if (!subscriber.isReady) {
      this.logger.warn("Redis event subscriber unavailable; readiness remains false.");
      return;
    }
    this.subscribing = true;
    try {
      await subscriber.subscribe(this.channel, (message) => this.deliver(message));
      this.subscribed = true;
    } finally {
      this.subscribing = false;
    }
  }

  private deliver(message: string): void {
    if (!this.server) {
      this.logger.warn("Socket server unavailable while consuming realtime event.");
      return;
    }

    try {
      const envelope = JSON.parse(message) as Record<string, unknown>;
      const organizationId = envelope.organizationId;
      if (typeof organizationId !== "string") throw new Error("Missing organizationId");

      const parsed = AppointmentChangedEventSchema.safeParse({
        appointmentId: envelope.appointmentId,
        professionalId: envelope.professionalId,
        eventType: envelope.eventType,
        date: envelope.date,
        version: envelope.version,
        occurredAt: envelope.occurredAt,
      });
      if (!parsed.success) throw new Error("Invalid appointment event contract");

      this.server.local.to(`org:${organizationId}`).emit("appointment.changed", parsed.data);
      this.server.local
        .to(`professional:${organizationId}:${parsed.data.professionalId}`)
        .emit("appointment.changed", parsed.data);
    } catch (error) {
      this.logger.warn(
        `Ignored invalid distributed realtime event: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }
}
