import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Inject,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import { ROLES_KEY } from "../decorators/roles.decorator";
import { DbService } from "../../db";
import { auditLogs } from "../../../db/schema";
import { AuthzDeniedException } from "../../common/exceptions/domain.exception";

interface TenantInfo {
  orgId: string;
  userId: string;
  role: string;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(DbService) private readonly db: DbService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      throw new AuthzDeniedException();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const tenant = (req as unknown as { tenant?: TenantInfo }).tenant;

    if (!tenant) {
      throw new AuthzDeniedException();
    }

    const hasRole = requiredRoles.includes(tenant.role);
    if (!hasRole) {
      this.writeAudit(tenant, requiredRoles);
      throw new AuthzDeniedException();
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
