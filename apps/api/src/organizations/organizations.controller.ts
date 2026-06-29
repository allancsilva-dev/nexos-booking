import {
  Controller,
  Inject,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  NotFoundException,
} from "@nestjs/common";
import type { Request } from "express";

import { OrganizationsService } from "./organizations.service";
import { InvitationsService } from "./invitations/invitations.service";
import { AuthGuard } from "../auth/guards/auth.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { RolesGuard } from "../authorization/guards/roles.guard";
import { Roles } from "../authorization/decorators/roles.decorator";
import {
  UpdateOrganizationSchema,
  InviteMemberSchema,
  UpdateMemberSchema,
} from "@nexos/shared";
import { parseBody } from "../common/validation/parse-body";

interface TenantInfo {
  orgId: string;
  userId: string;
  role: string;
}

function getTenant(req: Request): TenantInfo {
  const tenant = (req as unknown as { tenant?: TenantInfo }).tenant;
  if (!tenant) {
    throw new NotFoundException("Organization not found");
  }
  return tenant;
}

function validateOrgId(req: Request, paramId: string): void {
  const tenant = getTenant(req);
  if (tenant.orgId !== paramId) {
    throw new NotFoundException("Organization not found");
  }
}

@Controller("organizations")
export class OrganizationsController {
  constructor(
    @Inject(OrganizationsService)
    private readonly orgs: OrganizationsService,
    @Inject(InvitationsService)
    private readonly invitations: InvitationsService,
  ) {}

  @Get("me")
  @UseGuards(AuthGuard)
  async listMine(@Req() req: Request) {
    const payload = (req as unknown as { accessPayload: { sub: string } })
      .accessPayload;
    return this.orgs.me(payload.sub);
  }

  @Get(":id")
  @UseGuards(AuthGuard, TenantGuard, RolesGuard)
  @Roles("OWNER", "MANAGER", "PROFESSIONAL")
  async getById(@Param("id") id: string, @Req() req: Request) {
    validateOrgId(req, id);
    const tenant = getTenant(req);
    return this.orgs.getById(id, tenant.userId);
  }

  @Patch(":id")
  @UseGuards(AuthGuard, TenantGuard, RolesGuard)
  @Roles("OWNER")
  async update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    validateOrgId(req, id);
    const tenant = getTenant(req);
    const data = parseBody(UpdateOrganizationSchema, body);
    return this.orgs.update(id, tenant.userId, data);
  }

  @Get(":id/members")
  @UseGuards(AuthGuard, TenantGuard, RolesGuard)
  @Roles("OWNER", "MANAGER")
  async listMembers(@Param("id") id: string, @Req() req: Request) {
    validateOrgId(req, id);
    return this.orgs.getMembers(id);
  }

  @Patch(":id/members/:userId")
  @UseGuards(AuthGuard, TenantGuard, RolesGuard)
  @Roles("OWNER")
  async updateMember(
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    validateOrgId(req, id);
    const tenant = getTenant(req);
    const data = parseBody(UpdateMemberSchema, body);
    return this.orgs.updateMember(id, tenant.userId, userId, data);
  }

  @Get(":id/invitations")
  @UseGuards(AuthGuard, TenantGuard, RolesGuard)
  @Roles("OWNER")
  async listInvitations(@Param("id") id: string, @Req() req: Request) {
    validateOrgId(req, id);
    return this.invitations.list(id);
  }

  @Post(":id/members/invite")
  @UseGuards(AuthGuard, TenantGuard, RolesGuard)
  @Roles("OWNER")
  async inviteMember(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    validateOrgId(req, id);
    const tenant = getTenant(req);
    const data = parseBody(InviteMemberSchema, body);
    return this.invitations.create(id, tenant.userId, data.email, data.role);
  }

  @Delete(":id/invitations/:invitationId")
  @UseGuards(AuthGuard, TenantGuard, RolesGuard)
  @Roles("OWNER")
  async revokeInvitation(
    @Param("id") id: string,
    @Param("invitationId") invitationId: string,
    @Req() req: Request,
  ) {
    validateOrgId(req, id);
    const tenant = getTenant(req);
    await this.invitations.revoke(id, invitationId, tenant.userId);
  }
}
