import { Injectable } from "@nestjs/common";
import { eq, and, sql } from "drizzle-orm";
import type { DbTransaction } from "../db/db.types";
import { professionals, organizationUsers } from "../../db/schema";

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
}
