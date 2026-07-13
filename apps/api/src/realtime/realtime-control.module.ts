import { Global, Module } from "@nestjs/common";
import { KickService } from "./kick.service";

@Global()
@Module({
  providers: [KickService],
  exports: [KickService],
})
export class RealtimeControlModule {}
