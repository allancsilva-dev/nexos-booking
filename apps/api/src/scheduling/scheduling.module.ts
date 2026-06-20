import { Module } from "@nestjs/common";
import { WorkingHoursService } from "./working-hours.service";
import { WorkingHoursRepository } from "./working-hours.repository";
import { AvailabilityBlocksService } from "./availability-blocks.service";
import { AvailabilityBlocksRepository } from "./availability-blocks.repository";

@Module({
  providers: [
    WorkingHoursService,
    WorkingHoursRepository,
    AvailabilityBlocksService,
    AvailabilityBlocksRepository,
  ],
  exports: [WorkingHoursService, AvailabilityBlocksService],
})
export class SchedulingModule {}
