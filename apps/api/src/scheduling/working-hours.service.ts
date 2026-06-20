import {
  Injectable,
  Inject,
  NotFoundException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";

import { DbService } from "../db";
import { withTenantContext } from "../db/tenant-context";
import { WorkingHoursRepository } from "./working-hours.repository";
import { WorkingHoursConflictException } from "../common/exceptions/working-hours-conflict.exception";
import { WorkingHoursSchema } from "@nexos/shared";
import { auditLogs } from "../../db/schema";
import { professionals } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import type { WorkingHoursInput } from "@nexos/shared";

function mapShift(row: {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
}) {
  return {
    id: row.id,
    weekday: row.weekday,
    startTime: row.start_time,
    endTime: row.end_time,
  };
}

@Injectable()
export class WorkingHoursService {
  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject(WorkingHoursRepository)
    private readonly repo: WorkingHoursRepository,
  ) {}

  async getWorkingHours(orgId: string, professionalId: string) {
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

      const rows = await this.repo.findByProfessional(
        tx,
        orgId,
        professionalId,
      );
      return rows.map(mapShift);
    });
  }

  async setWorkingHours(
    orgId: string,
    professionalId: string,
    userId: string,
    input: WorkingHoursInput,
  ) {
    const parsed = WorkingHoursSchema.safeParse(input);
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

      const weekdays = new Set(input.shifts.map((s) => s.weekday));

      await this.repo.deleteByProfessional(tx, orgId, professionalId);

      const rows = input.shifts.map((s) => ({
        organization_id: orgId,
        professional_id: professionalId,
        weekday: s.weekday,
        start_time: s.startTime,
        end_time: s.endTime,
      }));

      try {
        await this.repo.insertMany(tx, rows);
      } catch (err) {
        const pgErr = err as {
          code?: string;
          cause?: { code?: string };
        };
        const code =
          pgErr.code ??
          (pgErr.cause && typeof pgErr.cause === "object"
            ? (pgErr.cause as { code?: string }).code
            : undefined);
        if (code === "23P01") {
          throw new WorkingHoursConflictException();
        }
        throw err;
      }

      await tx.insert(auditLogs).values({
        organization_id: orgId,
        actor_user_id: userId,
        action: "WORKING_HOURS_UPDATED",
        target_type: "professional",
        target_id: professionalId,
        metadata: {
          professionalId,
          shiftCount: input.shifts.length,
          weekdayCount: weekdays.size,
        },
      });

      const savedRows = await this.repo.findByProfessional(
        tx,
        orgId,
        professionalId,
      );
      return savedRows.map(mapShift);
    });
  }
}
