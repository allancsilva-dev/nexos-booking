import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { ServicesController } from "./services.controller";
import { ServicesService } from "./services.service";
import { ServicesRepository } from "./services.repository";

@Module({
  imports: [forwardRef(() => AuthModule), AuthorizationModule],
  controllers: [ServicesController],
  providers: [ServicesService, ServicesRepository],
})
export class ServicesModule {}
