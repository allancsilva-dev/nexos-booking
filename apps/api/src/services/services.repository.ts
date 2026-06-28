import { Injectable } from "@nestjs/common";
import { eq, and } from "drizzle-orm";
import type { DbTransaction } from "../db/db.types";
import { services } from "../../db/schema";

@Injectable()
export class ServicesRepository {
  async findAll(tx: DbTransaction, orgId: string) {
    return tx
      .select()
      .from(services)
      .where(eq(services.organization_id, orgId))
      .orderBy(services.name);
  }

  async findById(tx: DbTransaction, orgId: string, id: string) {
    const rows = await tx
      .select()
      .from(services)
      .where(
        and(
          eq(services.organization_id, orgId),
          eq(services.id, id),
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
      duration_min: number;
      buffer_after_min: number | null;
      price_cents: number;
      active: boolean;
    },
  ) {
    const [row] = await tx.insert(services).values(data).returning();
    return row!;
  }

  async update(
    tx: DbTransaction,
    orgId: string,
    id: string,
    data: {
      name?: string;
      duration_min?: number;
      buffer_after_min?: number | null;
      price_cents?: number;
      active?: boolean;
    },
  ) {
    const [row] = await tx
      .update(services)
      .set({ ...data, updated_at: new Date() })
      .where(
        and(
          eq(services.organization_id, orgId),
          eq(services.id, id),
        ),
      )
      .returning();
    return row ?? null;
  }
}
