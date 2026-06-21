import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { AppointmentsController } from "./appointments.controller";
import { AppointmentsService } from "./appointments.service";
import { AppointmentsRepository } from "./appointments.repository";
import { IfMatchGuard } from "./guards/if-match.guard";

@Module({
  imports: [
    forwardRef(() => AuthModule),
    AuthorizationModule,
    SchedulingModule,
    RealtimeModule,
  ],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AppointmentsRepository, IfMatchGuard],
})
export class AppointmentsModule {}
