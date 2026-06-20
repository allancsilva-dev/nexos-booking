import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { EventEmitterPublisher } from "./event-emitter.publisher";
import { OutboxRelayService } from "./relay.service";

@Module({
  imports: [EventEmitterModule.forRoot()],
  providers: [
    EventEmitterPublisher,
    OutboxRelayService,
    { provide: "AppointmentEventPublisher", useClass: EventEmitterPublisher },
  ],
  exports: ["AppointmentEventPublisher"],
})
export class RealtimeModule {}
