import { Injectable } from "@nestjs/common";
import { eq, and, sql } from "drizzle-orm";
import type { DbTransaction } from "../db";
import {
  organizations,
  services,
  professionals,
} from "../../db/schema";

@Injectable()
export class PublicBookingRepository {
  async resolveOrgIdBySlug(
    tx: DbTransaction,
    slug: string,
  ): Promise<string | null> {
    const result = await tx.execute<{ org_id: string }>(
      sql`SELECT app_resolve_org_by_slug(${slug}) AS org_id`,
    );
    return result.rows[0]?.org_id ?? null;
  }

  async findOrgPublicInfo(tx: DbTransaction, orgId: string) {
    return tx
      .select({
        name: organizations.name,
        slug: organizations.slug,
        timezone: organizations.timezone,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
  }

  async findActiveServices(tx: DbTransaction, orgId: string) {
    return tx
      .select({
        id: services.id,
        name: services.name,
        durationMin: services.duration_min,
        priceCents: services.price_cents,
        currency: services.currency,
      })
      .from(services)
      .where(
        and(
          eq(services.organization_id, orgId),
          eq(services.active, true),
        ),
      );
  }

  async findActiveProfessionals(tx: DbTransaction, orgId: string) {
    return tx
      .select({
        slug: professionals.slug,
        name: professionals.name,
      })
      .from(professionals)
      .where(
        and(
          eq(professionals.organization_id, orgId),
          eq(professionals.active, true),
        ),
      );
  }

  async findProfessionalBySlug(
    tx: DbTransaction,
    orgId: string,
    slug: string,
  ) {
    const rows = await tx
      .select({
        id: professionals.id,
        name: professionals.name,
      })
      .from(professionals)
      .where(
        and(
          eq(professionals.organization_id, orgId),
          eq(sql`lower(${professionals.slug})`, slug.toLowerCase()),
          eq(professionals.active, true),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }
}
