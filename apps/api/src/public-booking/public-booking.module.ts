import { Module } from "@nestjs/common";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { PublicBookingController } from "./public-booking.controller";
import { PublicBookingService } from "./public-booking.service";
import { PublicBookingRepository } from "./public-booking.repository";
import { PublicTenantGuard } from "./guards/public-tenant.guard";
import { RateLimitModule } from "../rate-limit/rate-limit.module";

@Module({
  imports: [SchedulingModule, RateLimitModule],
  controllers: [PublicBookingController],
  providers: [
    PublicBookingService,
    PublicBookingRepository,
    PublicTenantGuard,
  ],
})
export class PublicBookingModule {}
