import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { ProfessionalsController } from "./professionals.controller";
import { ProfessionalsService } from "./professionals.service";
import { ProfessionalsRepository } from "./professionals.repository";

@Module({
  imports: [forwardRef(() => AuthModule), AuthorizationModule],
  controllers: [ProfessionalsController],
  providers: [ProfessionalsService, ProfessionalsRepository],
})
export class ProfessionalsModule {}
