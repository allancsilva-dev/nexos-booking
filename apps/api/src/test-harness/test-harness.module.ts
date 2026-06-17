import { Module } from "@nestjs/common";

import { TestHarnessController } from "./test-harness.controller";
import { AuthModule } from "../auth";

@Module({
  imports: [AuthModule],
  controllers: [TestHarnessController],
})
export class TestHarnessModule {}
