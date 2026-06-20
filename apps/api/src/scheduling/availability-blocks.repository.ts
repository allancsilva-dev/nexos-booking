import { Injectable } from "@nestjs/common";
import { eq, and, lt, gt } from "drizzle-orm";
import type { DbTransaction } from "../db/db.types";
import { availabilityBlocks } from "../../db/schema";

@Injectable()
export class AvailabilityBlocksRepository {
  async findBlocks(
    tx: DbTransaction,
    orgId: string,
    professionalId: string,
    from: string,
    to: string,
  ) {
    return tx
      .select()
      .from(availabilityBlocks)
      .where(
        and(
          eq(availabilityBlocks.organization_id, orgId),
          eq(availabilityBlocks.professional_id, professionalId),
          lt(availabilityBlocks.starts_at, new Date(to)),
          gt(availabilityBlocks.ends_at, new Date(from)),
        ),
      );
  }

  async createBlock(
    tx: DbTransaction,
    orgId: string,
    professionalId: string,
    data: {
      starts_at: Date;
      ends_at: Date;
      reason: string | null;
    },
  ) {
    const [row] = await tx
      .insert(availabilityBlocks)
      .values({
        organization_id: orgId,
        professional_id: professionalId,
        starts_at: data.starts_at,
        ends_at: data.ends_at,
        reason: data.reason,
      })
      .returning();
    return row;
  }

  async findById(
    tx: DbTransaction,
    orgId: string,
    professionalId: string,
    blockId: string,
  ) {
    const rows = await tx
      .select()
      .from(availabilityBlocks)
      .where(
        and(
          eq(availabilityBlocks.organization_id, orgId),
          eq(availabilityBlocks.professional_id, professionalId),
          eq(availabilityBlocks.id, blockId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async deleteBlock(
    tx: DbTransaction,
    orgId: string,
    professionalId: string,
    blockId: string,
  ) {
    await tx
      .delete(availabilityBlocks)
      .where(
        and(
          eq(availabilityBlocks.organization_id, orgId),
          eq(availabilityBlocks.professional_id, professionalId),
          eq(availabilityBlocks.id, blockId),
        ),
      );
  }
}
