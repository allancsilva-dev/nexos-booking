import { Injectable } from "@nestjs/common";
import { eq, and, sql } from "drizzle-orm";
import type { DbTransaction } from "../db/db.types";
import {
  organizations,
  organizationUsers,
  users,
} from "../../db/schema";

@Injectable()
export class OrganizationsRepository {
  async findOrgById(tx: DbTransaction, orgId: string) {
    const rows = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    return rows[0] ?? null;
  }

  async updateOrg(
    tx: DbTransaction,
    orgId: string,
    data: {
      name?: string;
      slug?: string;
      timezone?: string;
      slotIntervalMin?: number;
    },
  ) {
    const [row] = await tx
      .update(organizations)
      .set({
        name: data.name,
        slug: data.slug,
        timezone: data.timezone,
        slot_interval_min: data.slotIntervalMin,
        updated_at: new Date(),
      })
      .where(eq(organizations.id, orgId))
      .returning();
    return row!;
  }

  async findMemberships(tx: DbTransaction, orgId: string) {
    return tx
      .select({
        userId: organizationUsers.user_id,
        name: users.name,
        email: users.email,
        role: organizationUsers.role,
        status: organizationUsers.status,
      })
      .from(organizationUsers)
      .innerJoin(users, eq(organizationUsers.user_id, users.id))
      .where(eq(organizationUsers.organization_id, orgId));
  }

  async findOrganizationsForUser(
    tx: DbTransaction,
    userId: string,
  ) {
    return tx
      .select({
        organizationId: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        timezone: organizations.timezone,
        slotIntervalMin: organizations.slot_interval_min,
        currency: organizations.currency,
        role: organizationUsers.role,
        status: organizationUsers.status,
      })
      .from(organizationUsers)
      .innerJoin(
        organizations,
        eq(organizationUsers.organization_id, organizations.id),
      )
      .where(
        and(
          eq(organizationUsers.user_id, userId),
          eq(organizationUsers.status, "ACTIVE"),
        ),
      );
  }

  async countActiveOwners(
    tx: DbTransaction,
    orgId: string,
  ): Promise<number> {
    const rows = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(organizationUsers)
      .where(
        and(
          eq(organizationUsers.organization_id, orgId),
          eq(organizationUsers.role, "OWNER"),
          eq(organizationUsers.status, "ACTIVE"),
        ),
      );
    return rows[0]?.count ?? 0;
  }

  async lockActiveOwners(
    tx: DbTransaction,
    orgId: string,
  ) {
    return tx
      .select({ id: organizationUsers.id })
      .from(organizationUsers)
      .where(
        and(
          eq(organizationUsers.organization_id, orgId),
          eq(organizationUsers.role, "OWNER"),
          eq(organizationUsers.status, "ACTIVE"),
        ),
      )
      .for("update");
  }

  async findMembership(
    tx: DbTransaction,
    orgId: string,
    userId: string,
  ) {
    const rows = await tx
      .select()
      .from(organizationUsers)
      .where(
        and(
          eq(organizationUsers.organization_id, orgId),
          eq(organizationUsers.user_id, userId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async updateMembership(
    tx: DbTransaction,
    orgId: string,
    userId: string,
    data: { role?: string; status?: string },
  ) {
    const [row] = await tx
      .update(organizationUsers)
      .set({ ...data, updated_at: new Date() })
      .where(
        and(
          eq(organizationUsers.organization_id, orgId),
          eq(organizationUsers.user_id, userId),
        ),
      )
      .returning();
    return row!;
  }

  async findUserById(tx: DbTransaction, userId: string) {
    const rows = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  async findOrgBySlug(tx: DbTransaction, slug: string) {
    const rows = await tx
      .select()
      .from(organizations)
      .where(eq(sql`lower(${organizations.slug})`, slug.toLowerCase()))
      .limit(1);
    return rows[0] ?? null;
  }
}
