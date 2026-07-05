import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";

import { DbModule } from "./db";
import { HealthModule } from "./health/health.module";
import { AuthModule } from "./auth";
import { OrganizationsModule } from "./organizations";
import { AuthorizationModule } from "./authorization";
import { MaintenanceModule } from "./maintenance";
import { ProfessionalsModule } from "./professionals";
import { ServicesModule } from "./services";
import { AppointmentsModule } from "./appointments";
import { PublicBookingModule } from "./public-booking/public-booking.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { ClientsModule } from "./clients";
import { DashboardModule } from "./dashboard";
import { IdempotencyInterceptor } from "./common/interceptors/idempotency.interceptor";

const dynamicImports = [
  DbModule,
  HealthModule,
  AuthModule,
  OrganizationsModule,
  AuthorizationModule,
  ScheduleModule.forRoot(),
  MaintenanceModule,
  ProfessionalsModule,
  ServicesModule,
  AppointmentsModule,
  PublicBookingModule,
  RealtimeModule,
  ClientsModule,
  DashboardModule,
];

if (process.env.ENABLE_HTTP_TEST_HARNESS === "1") {
  // Dynamic import only for test harness - never active in production
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TestHarnessModule } = require("./test-harness/test-harness.module");
  dynamicImports.push(TestHarnessModule);
}

@Module({
  imports: dynamicImports,
  providers: [{ provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor }],
})
export class AppModule {}
