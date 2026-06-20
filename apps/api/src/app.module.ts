import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";

import { DbModule } from "./db";
import { HealthModule } from "./health/health.module";
import { AuthModule } from "./auth";
import { OrganizationsModule } from "./organizations";
import { AuthorizationModule } from "./authorization";
import { MaintenanceModule } from "./maintenance";
import { ProfessionalsModule } from "./professionals";

const dynamicImports = [
  DbModule,
  HealthModule,
  AuthModule,
  OrganizationsModule,
  AuthorizationModule,
  ScheduleModule.forRoot(),
  MaintenanceModule,
  ProfessionalsModule,
];

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
