import {
  Injectable,
  Inject,
  NotFoundException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";

import { DbService } from "../db";
import { withTenantContext } from "../db/tenant-context";
import { AvailabilityBlocksRepository } from "./availability-blocks.repository";
import { CreateBlockSchema } from "@nexos/shared";
import { professionals } from "../../db/schema";
import { eq, and } from "drizzle-orm";

function mapBlock(row: {
  id: string;
  professional_id: string;
  starts_at: Date;
  ends_at: Date;
  reason: string | null;
  created_at: Date;
}) {
  return {
    id: row.id,
    professionalId: row.professional_id,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    reason: row.reason,
    createdAt: row.created_at.toISOString(),
  };
}

@Injectable()
export class AvailabilityBlocksService {
  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject(AvailabilityBlocksRepository)
    private readonly repo: AvailabilityBlocksRepository,
  ) {}

  async getBlocks(
    orgId: string,
    professionalId: string,
    from: string,
    to: string,
  ) {
    if (from >= to) {
      throw new HttpException(
        { error: { code: "VALIDATION_ERROR" as const, message: "from must be before to" } },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    return withTenantContext(this.db, orgId, null, async (tx) => {
      const profRows = await tx
        .select({ id: professionals.id })
        .from(professionals)
        .where(
          and(
            eq(professionals.organization_id, orgId),
            eq(professionals.id, professionalId),
          ),
        )
        .limit(1);

      if (profRows.length === 0) {
        throw new NotFoundException("Professional not found");
      }

      const rows = await this.repo.findBlocks(tx, orgId, professionalId, from, to);
      return rows.map(mapBlock);
    });
  }

  async createBlock(
    orgId: string,
    professionalId: string,
    userId: string,
    input: {
      startsAt: string;
      endsAt: string;
      reason?: string;
    },
  ) {
    const parsed = CreateBlockSchema.safeParse(input);
    if (!parsed.success) {
      const details = parsed.error.issues.map((e) => ({
        field: e.path.join("."),
        issue: e.message,
      }));
      throw new HttpException(
        { error: { code: "VALIDATION_ERROR" as const, message: "Invalid input", details } },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    return withTenantContext(this.db, orgId, userId, async (tx) => {
      const profRows = await tx
        .select({ id: professionals.id })
        .from(professionals)
        .where(
          and(
            eq(professionals.organization_id, orgId),
            eq(professionals.id, professionalId),
          ),
        )
        .limit(1);

      if (profRows.length === 0) {
        throw new NotFoundException("Professional not found");
      }

      const row = await this.repo.createBlock(tx, orgId, professionalId, {
        starts_at: new Date(parsed.data.startsAt),
        ends_at: new Date(parsed.data.endsAt),
        reason: parsed.data.reason ?? null,
      });

      return mapBlock(row);
    });
  }

  async deleteBlock(
    orgId: string,
    professionalId: string,
    userId: string,
    blockId: string,
  ) {
    return withTenantContext(this.db, orgId, userId, async (tx) => {
      const existing = await this.repo.findById(tx, orgId, professionalId, blockId);

      if (!existing) {
        throw new NotFoundException("Availability block not found");
      }

      await this.repo.deleteBlock(tx, orgId, professionalId, blockId);
    });
  }
}
