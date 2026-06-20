import { Module } from "@nestjs/common";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { PublicBookingController } from "./public-booking.controller";
import { PublicBookingService } from "./public-booking.service";
import { PublicBookingRepository } from "./public-booking.repository";
import { MemoryRateLimiter } from "../auth/rate-limit/rate-limiter.memory";

@Module({
  imports: [SchedulingModule],
  controllers: [PublicBookingController],
  providers: [
    PublicBookingService,
    PublicBookingRepository,
    { provide: "RateLimiter", useClass: MemoryRateLimiter },
  ],
})
export class PublicBookingModule {}
