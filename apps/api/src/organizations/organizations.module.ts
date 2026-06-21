import { Module, forwardRef } from "@nestjs/common";

import { OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";
import { OrganizationsRepository } from "./organizations.repository";
import { InvitationsService } from "./invitations/invitations.service";
import { InvitationsRepository } from "./invitations/invitations.repository";
import { AuthModule } from "../auth";
import { RealtimeModule } from "../realtime/realtime.module";

@Module({
  imports: [forwardRef(() => AuthModule), RealtimeModule],
  controllers: [OrganizationsController],
  providers: [
    OrganizationsService,
    OrganizationsRepository,
    InvitationsService,
    InvitationsRepository,
  ],
  exports: [
    OrganizationsService,
    OrganizationsRepository,
    InvitationsService,
    InvitationsRepository,
  ],
})
export class OrganizationsModule {}
