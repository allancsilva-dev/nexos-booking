import {
  Injectable,
  Inject,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import type { Request } from "express";
import { eq, and } from "drizzle-orm";

import { organizationUsers } from "../../../db/schema";
import { DbService } from "../../db";

interface AccessPayload {
  sub: string;
  sid: string;
  org?: string;
}

export interface TenantContext {
  orgId: string;
  userId: string;
  role: string;
}

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const payload = (req as unknown as { accessPayload?: AccessPayload })
      .accessPayload;

    if (!payload) {
      throw new ForbiddenException("Not authenticated");
    }

    if (!payload.org) {
      throw new ForbiddenException("No active organization");
    }

    const rows = await this.db.client
      .select({
        id: organizationUsers.id,
        role: organizationUsers.role,
      })
      .from(organizationUsers)
      .where(
        and(
          eq(organizationUsers.organization_id, payload.org),
          eq(organizationUsers.user_id, payload.sub),
          eq(organizationUsers.status, "ACTIVE"),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      throw new ForbiddenException("No active organization");
    }

    (req as unknown as { tenant: TenantContext }).tenant = {
      orgId: payload.org,
      userId: payload.sub,
      role: rows[0]!.role,
    };

    return true;
  }

  static resolveActiveOrg(req: Request): TenantContext | null {
    const payload = (req as unknown as { accessPayload?: AccessPayload })
      .accessPayload;

    if (!payload?.org) return null;

    const tenant = (req as unknown as { tenant?: TenantContext }).tenant;
    if (tenant) return tenant;

    return { orgId: payload.org, userId: payload.sub, role: "" };
  }
}
