import { Injectable } from "@nestjs/common";
import { eq, and, gt, or, asc, sql } from "drizzle-orm";
import type { DbTransaction } from "../db/db.types";
import {
  clients,
  appointments,
  professionals,
  auditLogs,
} from "../../db/schema";

@Injectable()
export class ClientsRepository {
  async findClients(
    tx: DbTransaction,
    orgId: string,
    filters: {
      search?: string;
      phoneNormalized?: string;
      cursor?: { name: string; id: string };
      limit: number;
      professionalId?: string;
    },
  ) {
    const baseConditions: (ReturnType<typeof eq> | ReturnType<typeof sql>)[] = [
      eq(clients.organization_id, orgId),
    ];

    if (filters.phoneNormalized) {
      baseConditions.push(eq(clients.phone_normalized, filters.phoneNormalized));
    } else if (filters.search) {
      baseConditions.push(
        sql`${clients.name} ILIKE ${"%" + filters.search + "%"}`,
      );
    }

    if (filters.cursor) {
      baseConditions.push(
        or(
          gt(clients.name, filters.cursor.name),
          and(
            eq(clients.name, filters.cursor.name),
            gt(clients.id, filters.cursor.id),
          ),
        )!,
      );
    }

    if (filters.professionalId) {
      return tx
        .selectDistinctOn([clients.name, clients.id], {
          id: clients.id,
          name: clients.name,
          phone: clients.phone,
        })
        .from(clients)
        .innerJoin(
          appointments,
          and(
            eq(clients.id, appointments.client_id),
            eq(appointments.organization_id, orgId),
            eq(appointments.professional_id, filters.professionalId),
          ),
        )
        .where(and(...baseConditions))
        .orderBy(asc(clients.name), asc(clients.id))
        .limit(filters.limit);
    }

    return tx
      .select({
        id: clients.id,
        name: clients.name,
        phone: clients.phone,
      })
      .from(clients)
      .where(and(...baseConditions))
      .orderBy(asc(clients.name), asc(clients.id))
      .limit(filters.limit);
  }

  async findClientById(
    tx: DbTransaction,
    orgId: string,
    clientId: string,
    professionalId?: string,
  ) {
    const clientRows = await tx
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.organization_id, orgId),
          eq(clients.id, clientId),
        ),
      )
      .limit(1);

    const client = clientRows[0] ?? null;
    if (!client) return null;

    const apptConditions: ReturnType<typeof eq>[] = [
      eq(appointments.organization_id, orgId),
      eq(appointments.client_id, clientId),
    ];

    if (professionalId) {
      apptConditions.push(eq(appointments.professional_id, professionalId));
    }

    const apptRows = await tx
      .select({
        id: appointments.id,
        professional_id: appointments.professional_id,
        service_id: appointments.service_id,
        starts_at: appointments.starts_at,
        ends_at: appointments.ends_at,
        status: appointments.status,
        source: appointments.source,
      })
      .from(appointments)
      .where(and(...apptConditions))
      .orderBy(asc(appointments.starts_at), asc(appointments.id));

    return { client, appointments: apptRows };
  }

  async findClientByPhoneNormalized(
    tx: DbTransaction,
    orgId: string,
    phoneNormalized: string,
    excludeId?: string,
  ) {
    const conditions = [
      eq(clients.organization_id, orgId),
      eq(clients.phone_normalized, phoneNormalized),
    ];
    if (excludeId) {
      conditions.push(sql`${clients.id} != ${excludeId}` as ReturnType<typeof eq>);
    }

    const rows = await tx
      .select()
      .from(clients)
      .where(and(...conditions))
      .limit(1);
    return rows[0] ?? null;
  }

  async updateClient(
    tx: DbTransaction,
    orgId: string,
    clientId: string,
    data: {
      name?: string;
      phone?: string | null;
      phone_normalized?: string | null;
    },
  ) {
    const [row] = await tx
      .update(clients)
      .set({ ...data, updated_at: new Date() })
      .where(
        and(
          eq(clients.organization_id, orgId),
          eq(clients.id, clientId),
        ),
      )
      .returning();
    return row ?? null;
  }

  async anonymizeClient(
    tx: DbTransaction,
    orgId: string,
    clientId: string,
  ) {
    const [updatedClient] = await tx
      .update(clients)
      .set({
        name: "Cliente removido",
        phone: null,
        phone_normalized: null,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(clients.organization_id, orgId),
          eq(clients.id, clientId),
        ),
      )
      .returning();

    if (!updatedClient) return null;

    await tx
      .update(appointments)
      .set({ note: null })
      .where(
        and(
          eq(appointments.organization_id, orgId),
          eq(appointments.client_id, clientId),
        ),
      );

    return updatedClient;
  }

  async insertAudit(
    tx: DbTransaction,
    row: {
      organization_id: string;
      actor_user_id: string;
      action: string;
      target_type: string;
      target_id: string;
      metadata: Record<string, unknown>;
    },
  ) {
    await tx.insert(auditLogs).values(row);
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
}
