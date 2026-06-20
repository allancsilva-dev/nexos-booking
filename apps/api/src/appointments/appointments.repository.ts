import { Injectable } from "@nestjs/common";
import { eq, and, lt, gt } from "drizzle-orm";
import type { DbTransaction } from "../db/db.types";
import {
  professionals,
  services,
  organizations,
  workingHours,
  availabilityBlocks,
  professionalServices,
  clients,
  appointments,
  appointmentEvents,
} from "../../db/schema";

@Injectable()
export class AppointmentsRepository {
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

  async findWorkingHoursForWeekday(
    tx: DbTransaction,
    orgId: string,
    professionalId: string,
    weekday: number,
  ) {
    return tx
      .select()
      .from(workingHours)
      .where(
        and(
          eq(workingHours.organization_id, orgId),
          eq(workingHours.professional_id, professionalId),
          eq(workingHours.weekday, weekday),
        ),
      );
  }

  async findBlocksInRange(
    tx: DbTransaction,
    orgId: string,
    professionalId: string,
    from: Date,
    to: Date,
  ) {
    return tx
      .select()
      .from(availabilityBlocks)
      .where(
        and(
          eq(availabilityBlocks.organization_id, orgId),
          eq(availabilityBlocks.professional_id, professionalId),
          lt(availabilityBlocks.starts_at, to),
          gt(availabilityBlocks.ends_at, from),
        ),
      );
  }

  async upsertClientByPhone(
    tx: DbTransaction,
    orgId: string,
    name: string,
    phone: string | null,
    phoneNormalized: string | null,
  ) {
    const insertResult = await tx
      .insert(clients)
      .values({
        organization_id: orgId,
        name,
        phone,
        phone_normalized: phoneNormalized,
      })
      .onConflictDoNothing({
        target: [
          clients.organization_id,
          clients.phone_normalized,
        ],
      });

    if ((insertResult as unknown as { rowCount: number }).rowCount === 0) {
      const rows = await tx
        .select()
        .from(clients)
        .where(
          and(
            eq(clients.organization_id, orgId),
            eq(clients.phone_normalized, phoneNormalized ?? ""),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    }

    const rows = await tx
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.organization_id, orgId),
          eq(clients.phone_normalized, phoneNormalized ?? ""),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async findClientById(tx: DbTransaction, orgId: string, clientId: string) {
    const rows = await tx
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.organization_id, orgId),
          eq(clients.id, clientId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async insertAppointment(
    tx: DbTransaction,
    row: {
      organization_id: string;
      professional_id: string;
      service_id: string;
      client_id: string;
      starts_at: Date;
      ends_at: Date;
      status: string;
      source: string;
      note: string | null;
      version: number;
      public_cancel_token_hash: string | null;
      public_cancel_token_expires_at: Date | null;
    },
  ) {
    const result = await tx
      .insert(appointments)
      .values(row)
      .returning();
    return result[0]!;
  }

  async findAppointmentById(
    tx: DbTransaction,
    orgId: string,
    id: string,
  ) {
    const rows = await tx
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.organization_id, orgId),
          eq(appointments.id, id),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async updateAppointment(
    tx: DbTransaction,
    orgId: string,
    id: string,
    currentVersion: number,
    data: Record<string, unknown>,
  ) {
    const result = await tx
      .update(appointments)
      .set({ ...data, version: currentVersion + 1, updated_at: new Date() })
      .where(
        and(
          eq(appointments.organization_id, orgId),
          eq(appointments.id, id),
          eq(appointments.version, currentVersion),
        ),
      )
      .returning();
    return result[0] ?? null;
  }

  async insertAppointmentEvent(
    tx: DbTransaction,
    row: {
      organization_id: string;
      appointment_id: string;
      event_type: string;
      actor_type: string;
      actor_user_id: string;
      metadata: Record<string, unknown>;
    },
  ) {
    await tx.insert(appointmentEvents).values(row);
  }
}
