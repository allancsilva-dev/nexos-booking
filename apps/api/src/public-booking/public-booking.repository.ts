import { Injectable, Inject } from "@nestjs/common";
import { eq, and, lt, gt, sql } from "drizzle-orm";
import { DbService } from "../db";
import type { DbTransaction } from "../db";
import {
  organizations,
  services,
  professionals,
  professionalServices,
  workingHours,
  availabilityBlocks,
  clients,
  appointments,
  appointmentEvents,
} from "../../db/schema";

@Injectable()
export class PublicBookingRepository {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  async resolveOrgBySlug(slug: string): Promise<string | null> {
    const result = await this.db.client.execute<{ org_id: string }>(
      sql`SELECT app_resolve_org_by_slug(${slug}) AS org_id`,
    );
    return result.rows[0]?.org_id ?? null;
  }

  async resolveOrgIdBySlug(
    tx: DbTransaction,
    slug: string,
  ): Promise<string | null> {
    const result = await tx.execute<{ org_id: string }>(
      sql`SELECT app_resolve_org_by_slug(${slug}) AS org_id`,
    );
    return result.rows[0]?.org_id ?? null;
  }

  async findOrgPublicInfo(tx: DbTransaction, orgId: string) {
    return tx
      .select({
        name: organizations.name,
        slug: organizations.slug,
        timezone: organizations.timezone,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
  }

  async findActiveServices(tx: DbTransaction, orgId: string) {
    return tx
      .select({
        id: services.id,
        name: services.name,
        durationMin: services.duration_min,
        priceCents: services.price_cents,
        currency: services.currency,
      })
      .from(services)
      .where(
        and(
          eq(services.organization_id, orgId),
          eq(services.active, true),
        ),
      );
  }

  async findActiveProfessionals(tx: DbTransaction, orgId: string) {
    return tx
      .select({
        slug: professionals.slug,
        name: professionals.name,
      })
      .from(professionals)
      .where(
        and(
          eq(professionals.organization_id, orgId),
          eq(professionals.active, true),
        ),
      );
  }

  async findProfessionalBySlug(
    tx: DbTransaction,
    orgId: string,
    slug: string,
  ) {
    const rows = await tx
      .select({
        id: professionals.id,
        name: professionals.name,
        slug: professionals.slug,
      })
      .from(professionals)
      .where(
        and(
          eq(professionals.organization_id, orgId),
          eq(sql`lower(${professionals.slug})`, slug.toLowerCase()),
          eq(professionals.active, true),
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

  async insertAppointmentEvent(
    tx: DbTransaction,
    row: {
      organization_id: string;
      appointment_id: string;
      event_type: string;
      actor_type: string;
      actor_user_id: string | null;
      metadata: Record<string, unknown>;
    },
  ) {
    await tx.insert(appointmentEvents).values(row);
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

  async findAppointmentForPreview(
    tx: DbTransaction,
    orgId: string,
    id: string,
  ) {
    const rows = await tx
      .select({
        id: appointments.id,
        status: appointments.status,
        starts_at: appointments.starts_at,
        ends_at: appointments.ends_at,
        public_cancel_token_expires_at: appointments.public_cancel_token_expires_at,
        version: appointments.version,
        professionalName: professionals.name,
        serviceName: services.name,
      })
      .from(appointments)
      .innerJoin(professionals, eq(appointments.professional_id, professionals.id))
      .innerJoin(services, eq(appointments.service_id, services.id))
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

  async resolveByCancelHash(
    tx: DbTransaction,
    hash: string,
  ): Promise<{ organization_id: string; appointment_id: string } | null> {
    const result = await tx.execute<{
      organization_id: string;
      appointment_id: string;
    }>(
      sql`SELECT organization_id, appointment_id FROM app_resolve_appointment_by_cancel_hash(${hash})`,
    );
    return result.rows[0] ?? null;
  }
}
