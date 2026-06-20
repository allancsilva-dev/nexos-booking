import { Injectable } from "@nestjs/common";
import { eq, and, lt, gt, inArray, sql } from "drizzle-orm";
import type { DbTransaction } from "../db/db.types";
import {
  professionals,
  services,
  organizations,
  workingHours,
  availabilityBlocks,
  appointments,
  professionalServices,
} from "../../db/schema";

@Injectable()
export class AvailabilityRepository {
  async findProfessionalById(tx: DbTransaction, orgId: string, id: string) {
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

  async findProfessionalByUserId(
    tx: DbTransaction,
    orgId: string,
    userId: string,
  ) {
    const rows = await tx
      .select()
      .from(professionals)
      .where(
        and(
          eq(professionals.organization_id, orgId),
          eq(professionals.user_id, userId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async findServiceById(tx: DbTransaction, orgId: string, id: string) {
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

  async findOrgConfig(tx: DbTransaction, orgId: string) {
    const rows = await tx
      .select({
        timezone: organizations.timezone,
        slotIntervalMin: organizations.slot_interval_min,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    return rows[0] ?? null;
  }

  async findWorkingHours(
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

  async findActiveAppointments(
    tx: DbTransaction,
    orgId: string,
    professionalId: string,
    from: string,
    to: string,
  ) {
    return tx
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.organization_id, orgId),
          eq(appointments.professional_id, professionalId),
          inArray(appointments.status, ["SCHEDULED", "CONFIRMED"]),
          lt(appointments.starts_at, new Date(to)),
          gt(appointments.ends_at, new Date(from)),
        ),
      );
  }

  async findProfessionalBySlug(
    tx: DbTransaction,
    orgId: string,
    slug: string,
  ) {
    const rows = await tx
      .select()
      .from(professionals)
      .where(
        and(
          eq(professionals.organization_id, orgId),
          eq(sql`lower(${professionals.slug})`, slug.toLowerCase()),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async findProfessionalService(
    tx: DbTransaction,
    orgId: string,
    professionalId: string,
    serviceId: string,
  ) {
    const rows = await tx
      .select()
      .from(professionalServices)
      .where(
        and(
          eq(professionalServices.organization_id, orgId),
          eq(professionalServices.professional_id, professionalId),
          eq(professionalServices.service_id, serviceId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }
}
