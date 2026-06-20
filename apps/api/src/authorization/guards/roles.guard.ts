import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import { ROLES_KEY } from "../decorators/roles.decorator";
import { DbService } from "../../db";
import { auditLogs } from "../../../db/schema";

interface TenantInfo {
  orgId: string;
  userId: string;
  role: string;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DbService) private readonly db: DbService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      throw new ForbiddenException("Authorization denied");
    }

    const req = context.switchToHttp().getRequest<Request>();
    const tenant = (req as unknown as { tenant?: TenantInfo }).tenant;

    if (!tenant) {
      throw new ForbiddenException("Authorization denied");
    }

    const hasRole = requiredRoles.includes(tenant.role);
    if (!hasRole) {
      this.writeAudit(tenant, requiredRoles);
      throw new ForbiddenException("Authorization denied");
    }

    return true;
  }

  private writeAudit(tenant: TenantInfo, requiredRoles: string[]): void {
    this.db.client.insert(auditLogs).values({
      organization_id: tenant.orgId,
      actor_user_id: tenant.userId,
      action: "AUTHZ_DENIED",
      target_type: "guard",
      metadata: { requiredRoles, actualRole: tenant.role },
    }).catch(() => {});
  }
}
