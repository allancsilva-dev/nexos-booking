import { Injectable } from "@nestjs/common";
import { eq, and, lt, gt, gte, or, asc } from "drizzle-orm";
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
      service_name_snapshot: string;
      service_duration_min_snapshot: number;
      service_price_cents_snapshot: number;
      service_currency_snapshot: string;
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
    const result = await tx.insert(appointmentEvents).values(row).returning();
    return result[0]!;
  }

  async findAppointments(
    tx: DbTransaction,
    orgId: string,
    filters: {
      from: Date;
      to: Date;
      professionalId?: string;
      serviceId?: string;
      status?: string;
      cursor?: { startsAt: Date; id: string };
      limit: number;
    },
  ) {
    const conditions: ReturnType<typeof eq>[] = [
      eq(appointments.organization_id, orgId),
      gte(appointments.starts_at, filters.from),
      lt(appointments.starts_at, filters.to),
    ];

    if (filters.professionalId) {
      conditions.push(eq(appointments.professional_id, filters.professionalId));
    }
    if (filters.serviceId) {
      conditions.push(eq(appointments.service_id, filters.serviceId));
    }
    if (filters.status) {
      conditions.push(eq(appointments.status, filters.status));
    }
    if (filters.cursor) {
      conditions.push(
        or(
          gt(appointments.starts_at, filters.cursor.startsAt),
          and(
            eq(appointments.starts_at, filters.cursor.startsAt),
            gt(appointments.id, filters.cursor.id),
          ),
        )!,
      );
    }

    return tx
      .select({
        id: appointments.id,
        professional_id: appointments.professional_id,
        service_id: appointments.service_id,
        starts_at: appointments.starts_at,
        ends_at: appointments.ends_at,
        status: appointments.status,
        source: appointments.source,
        version: appointments.version,
        client_name: clients.name,
        client_phone: clients.phone,
        professional_user_id: professionals.user_id,
      })
      .from(appointments)
      .innerJoin(clients, eq(appointments.client_id, clients.id))
      .innerJoin(professionals, eq(appointments.professional_id, professionals.id))
      .where(and(...conditions))
      .orderBy(asc(appointments.starts_at), asc(appointments.id))
      .limit(filters.limit);
  }

  async findEventsByAppointment(
    tx: DbTransaction,
    orgId: string,
    appointmentId: string,
  ) {
    return tx
      .select({
        id: appointmentEvents.id,
        event_type: appointmentEvents.event_type,
        actor_type: appointmentEvents.actor_type,
        created_at: appointmentEvents.created_at,
        metadata: appointmentEvents.metadata,
      })
      .from(appointmentEvents)
      .where(
        and(
          eq(appointmentEvents.organization_id, orgId),
          eq(appointmentEvents.appointment_id, appointmentId),
        ),
      )
      .orderBy(asc(appointmentEvents.created_at), asc(appointmentEvents.id));
  }
}
