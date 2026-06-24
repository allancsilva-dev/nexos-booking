import { Injectable } from "@nestjs/common";
import { eq, and, sql, inArray } from "drizzle-orm";
import type { DbTransaction } from "../db/db.types";
import {
  professionals,
  organizationUsers,
  professionalServices,
  services,
} from "../../db/schema";

@Injectable()
export class ProfessionalsRepository {
  async findAll(tx: DbTransaction, orgId: string) {
    return tx
      .select()
      .from(professionals)
      .where(eq(professionals.organization_id, orgId))
      .orderBy(professionals.name);
  }

  async findById(tx: DbTransaction, orgId: string, id: string) {
    const rows = await tx
      .select()
      .from(professionals)
      .where(
        and(
          eq(professionals.organization_id, orgId),
          eq(professionals.id, id),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async create(
    tx: DbTransaction,
    data: {
      organization_id: string;
      name: string;
      slug: string;
      user_id: string | null;
    },
  ) {
    const [row] = await tx.insert(professionals).values(data).returning();
    return row!;
  }

  async update(
    tx: DbTransaction,
    orgId: string,
    id: string,
    data: {
      name?: string;
      slug?: string;
      active?: boolean;
      user_id?: string | null;
    },
  ) {
    const [row] = await tx
      .update(professionals)
      .set({ ...data, updated_at: new Date() })
      .where(
        and(
          eq(professionals.organization_id, orgId),
          eq(professionals.id, id),
        ),
      )
      .returning();
    return row ?? null;
  }

  async findMembershipActive(
    tx: DbTransaction,
    orgId: string,
    userId: string,
  ) {
    const rows = await tx
      .select({ ok: sql`1` })
      .from(organizationUsers)
      .where(
        and(
          eq(organizationUsers.organization_id, orgId),
          eq(organizationUsers.user_id, userId),
          eq(organizationUsers.status, "ACTIVE"),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  // ── professional_services ──────────────────────────────────────

  async getServiceIds(
    tx: DbTransaction,
    orgId: string,
    professionalId: string,
  ): Promise<string[]> {
    const rows = await tx
      .select({ service_id: professionalServices.service_id })
      .from(professionalServices)
      .where(
        and(
          eq(professionalServices.organization_id, orgId),
          eq(professionalServices.professional_id, professionalId),
        ),
      );
    return rows.map((r) => r.service_id);
  }

  async validateServiceIds(
    tx: DbTransaction,
    orgId: string,
    serviceIds: string[],
  ): Promise<Set<string>> {
    if (serviceIds.length === 0) return new Set();
    const rows = await tx
      .select({ id: services.id })
      .from(services)
      .where(
        and(
          eq(services.organization_id, orgId),
          inArray(services.id, serviceIds),
        ),
      );
    return new Set(rows.map((r) => r.id));
  }

  async replaceServiceLinks(
    tx: DbTransaction,
    orgId: string,
    professionalId: string,
    toAdd: string[],
    toRemove: string[],
  ): Promise<void> {
    if (toRemove.length > 0) {
      await tx
        .delete(professionalServices)
        .where(
          and(
            eq(professionalServices.organization_id, orgId),
            eq(professionalServices.professional_id, professionalId),
            inArray(professionalServices.service_id, toRemove),
          ),
        );
    }
    if (toAdd.length > 0) {
      await tx.insert(professionalServices).values(
        toAdd.map((sid) => ({
          organization_id: orgId,
          professional_id: professionalId,
          service_id: sid,
        })),
      );
    }
  }
}
