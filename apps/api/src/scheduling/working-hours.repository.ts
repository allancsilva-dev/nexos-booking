import { Injectable } from "@nestjs/common";
import { eq, and } from "drizzle-orm";
import type { DbTransaction } from "../db/db.types";
import { workingHours } from "../../db/schema";

@Injectable()
export class WorkingHoursRepository {
  async findByProfessional(
    tx: DbTransaction,
    orgId: string,
    professionalId: string,
  ) {
    return tx
      .select()
      .from(workingHours)
      .where(
        and(
          eq(workingHours.organization_id, orgId),
          eq(workingHours.professional_id, professionalId),
        ),
      );
  }

  async deleteByProfessional(
    tx: DbTransaction,
    orgId: string,
    professionalId: string,
  ) {
    await tx
      .delete(workingHours)
      .where(
        and(
          eq(workingHours.organization_id, orgId),
          eq(workingHours.professional_id, professionalId),
        ),
      );
  }

  async insertMany(
    tx: DbTransaction,
    rows: {
      organization_id: string;
      professional_id: string;
      weekday: number;
      start_time: string;
      end_time: string;
    }[],
  ) {
    if (rows.length === 0) return;
    await tx.insert(workingHours).values(rows);
  }
}
