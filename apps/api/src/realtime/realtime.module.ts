import { Module, forwardRef } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { EventEmitterPublisher } from "./event-emitter.publisher";
import { OutboxRelayService } from "./relay.service";
import { KickService } from "./kick.service";
import { AppointmentsGateway } from "./websocket.gateway";
import { AuthModule } from "../auth";

@Module({
  imports: [EventEmitterModule.forRoot(), forwardRef(() => AuthModule)],
  providers: [
    EventEmitterPublisher,
    OutboxRelayService,
    KickService,
    AppointmentsGateway,
    { provide: "AppointmentEventPublisher", useClass: EventEmitterPublisher },
  ],
  exports: ["AppointmentEventPublisher", KickService],
})
export class RealtimeModule {}
