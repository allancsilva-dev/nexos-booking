import { Module, forwardRef } from "@nestjs/common";
import { OutboxRelayService } from "./relay.service";
import { AppointmentsGateway } from "./websocket.gateway";
import { AuthModule } from "../auth";
import { RedisRealtimeTransport } from "./redis-realtime.transport";
import { RedisModule } from "../redis/redis.module";
import { RealtimeControlModule } from "./realtime-control.module";

@Module({
  imports: [RedisModule, RealtimeControlModule, forwardRef(() => AuthModule)],
  providers: [
    RedisRealtimeTransport,
    OutboxRelayService,
    AppointmentsGateway,
    { provide: "AppointmentEventPublisher", useExisting: RedisRealtimeTransport },
  ],
  exports: ["AppointmentEventPublisher", RealtimeControlModule],
})
export class RealtimeModule {}
