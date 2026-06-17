import { Module } from "@nestjs/common";

import { TestHarnessController } from "./test-harness.controller";

@Module({
  controllers: [TestHarnessController],
})
export class TestHarnessModule {}
