import {
  Injectable,
  Inject,
  CanActivate,
  ExecutionContext,
} from "@nestjs/common";
import type { Request } from "express";
import { eq, and, sql } from "drizzle-orm";

import { organizationUsers } from "../../../db/schema";
import { DbService } from "../../db";
import {
  AuthzDeniedException,
  NoActiveOrgException,
} from "../../common/exceptions/domain.exception";

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
      throw new AuthzDeniedException();
    }

    if (!payload.org) {
      throw new NoActiveOrgException();
    }
    const activeOrg = payload.org;

    const rows = await this.db.client.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.current_organization_id', ${activeOrg}, true)`,
      );
      await tx.execute(
        sql`SELECT set_config('app.current_user_id', ${payload.sub}, true)`,
      );

      return tx
        .select({
          id: organizationUsers.id,
          role: organizationUsers.role,
        })
        .from(organizationUsers)
        .where(
          and(
            eq(organizationUsers.organization_id, activeOrg),
            eq(organizationUsers.user_id, payload.sub),
            eq(organizationUsers.status, "ACTIVE"),
          ),
        )
        .limit(1);
    });

    if (rows.length === 0) {
      throw new NoActiveOrgException();
    }

    (req as unknown as { tenant: TenantContext }).tenant = {
      orgId: activeOrg,
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
