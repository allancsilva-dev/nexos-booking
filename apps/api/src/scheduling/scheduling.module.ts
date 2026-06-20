import { Module } from "@nestjs/common";
import { WorkingHoursService } from "./working-hours.service";
import { WorkingHoursRepository } from "./working-hours.repository";
import { AvailabilityBlocksService } from "./availability-blocks.service";
import { AvailabilityBlocksRepository } from "./availability-blocks.repository";
import { AvailabilityService } from "./availability.service";
import { AvailabilityRepository } from "./availability.repository";
import { AvailabilityController } from "./availability.controller";

@Module({
  controllers: [AvailabilityController],
  providers: [
    WorkingHoursService,
    WorkingHoursRepository,
    AvailabilityBlocksService,
    AvailabilityBlocksRepository,
    AvailabilityService,
    AvailabilityRepository,
  ],
  exports: [WorkingHoursService, AvailabilityBlocksService, AvailabilityService],
})
export class SchedulingModule {}
