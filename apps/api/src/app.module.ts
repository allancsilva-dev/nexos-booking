import { Module } from "@nestjs/common";

import { DbModule } from "./db";
import { HealthModule } from "./health/health.module";

const dynamicImports = [DbModule, HealthModule];

if (process.env.ENABLE_HTTP_TEST_HARNESS === "1") {
  // Dynamic import only for test harness - never active in production
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TestHarnessModule } = require("./test-harness/test-harness.module");
  dynamicImports.push(TestHarnessModule);
}

@Module({
  imports: dynamicImports,
})
export class AppModule {}
