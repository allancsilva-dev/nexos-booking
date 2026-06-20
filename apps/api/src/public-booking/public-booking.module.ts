import { Module } from "@nestjs/common";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { PublicBookingController } from "./public-booking.controller";
import { PublicBookingService } from "./public-booking.service";
import { PublicBookingRepository } from "./public-booking.repository";
import { PublicTenantGuard } from "./guards/public-tenant.guard";
import { MemoryRateLimiter } from "../auth/rate-limit/rate-limiter.memory";

@Module({
  imports: [SchedulingModule],
  controllers: [PublicBookingController],
  providers: [
    PublicBookingService,
    PublicBookingRepository,
    PublicTenantGuard,
    { provide: "RateLimiter", useClass: MemoryRateLimiter },
  ],
})
export class PublicBookingModule {}
