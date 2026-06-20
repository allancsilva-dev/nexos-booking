import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { AppointmentEventPublisher, PublishedEvent } from "./publisher.interface";

@Injectable()
export class EventEmitterPublisher implements AppointmentEventPublisher {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  async publish(event: PublishedEvent): Promise<void> {
    this.eventEmitter.emit("appointment.changed", event);
  }
}
