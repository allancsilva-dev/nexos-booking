import { Module } from "@nestjs/common";
import { WorkingHoursService } from "./working-hours.service";
import { WorkingHoursRepository } from "./working-hours.repository";

@Module({
  providers: [WorkingHoursService, WorkingHoursRepository],
  exports: [WorkingHoursService],
})
export class SchedulingModule {}
