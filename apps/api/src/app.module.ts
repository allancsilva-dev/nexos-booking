import { Module } from "@nestjs/common";

import { DbModule } from "./db";

@Module({
  imports: [DbModule],
})
export class AppModule {}
