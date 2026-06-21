import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { DbService } from "../db";
import { withTenantContext } from "../db/tenant-context";
import { ClientsRepository } from "./clients.repository";
import { DomainException } from "../common/exceptions/domain.exception";
import { ValidationException } from "../common/exceptions/validation.exception";
import { normalizePhone } from "@nexos/shared";
import type {
  UpdateClientInput,
  AnonymizeResponse,
} from "@nexos/shared";

function encodeCursor(name: string, id: string): string {
  return Buffer.from(JSON.stringify({ name, id })).toString("base64");
}

function decodeCursor(raw: string): { name: string; id: string } | null {
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded) as { name: string; id: string };
    if (typeof parsed.name !== "string" || typeof parsed.id !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function mapClientListItem(row: {
  id: string;
  name: string;
  phone: string | null;
}) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
  };
}

function mapClientDetail(
  client: { id: string; name: string; phone: string | null },
  appointments: Array<{
    id: string;
    professional_id: string;
    service_id: string;
    starts_at: Date;
    ends_at: Date;
    status: string;
    source: string;
  }>,
) {
  return {
    id: client.id,
    name: client.name,
    phone: client.phone,
    appointments: appointments.map((a) => ({
      id: a.id,
      professionalId: a.professional_id,
      serviceId: a.service_id,
      startsAt: a.starts_at.toISOString(),
      endsAt: a.ends_at.toISOString(),
      status: a.status,
      source: a.source,
    })),
  };
}

@Injectable()
export class ClientsService {
  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject(ClientsRepository)
    private readonly repo: ClientsRepository,
  ) {}

  async listClients(
    orgId: string,
    userId: string,
    role: string,
    query: { search?: string; cursor?: string; limit?: number },
  ) {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);

    let cursor: { name: string; id: string } | undefined;
    if (query.cursor) {
      const decoded = decodeCursor(query.cursor);
      if (!decoded) {
        throw new HttpException(
          {
            error: {
              code: "VALIDATION_ERROR" as const,
              message: "Invalid cursor",
            },
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      cursor = decoded;
    }

    let phoneNormalized: string | undefined;
    let search: string | undefined;

    if (query.search) {
      const normalized = normalizePhone(query.search);
      if (normalized) {
        phoneNormalized = normalized;
      } else {
        search = query.search;
      }
    }

    let professionalId: string | undefined;
    if (role === "PROFESSIONAL") {
      const prof = await withTenantContext(this.db, orgId, userId, async (tx) => {
        return this.repo.findProfessionalByUserId(tx, orgId, userId);
      });
      if (!prof) {
        throw new ForbiddenException("Forbidden");
      }
      professionalId = prof.id;
    }

    const rows = await withTenantContext(this.db, orgId, userId, async (tx) => {
      return this.repo.findClients(tx, orgId, {
        search,
        phoneNormalized,
        cursor,
        limit: limit + 1,
        professionalId,
      });
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    let nextCursor: string | null = null;
    if (hasMore && page.length > 0) {
      const last = page[page.length - 1]!;
      nextCursor = encodeCursor(last.name, last.id);
    }

    const items = page.map((row) => mapClientListItem(row));

    return { items, nextCursor };
  }

  async getClient(
    orgId: string,
    userId: string,
    role: string,
    clientId: string,
  ) {
    return withTenantContext(this.db, orgId, userId, async (tx) => {
      let professionalId: string | undefined;
      if (role === "PROFESSIONAL") {
        const prof = await this.repo.findProfessionalByUserId(tx, orgId, userId);
        if (!prof) {
          throw new ForbiddenException("Forbidden");
        }
        professionalId = prof.id;
      }

      const result = await this.repo.findClientById(
        tx,
        orgId,
        clientId,
        professionalId,
      );

      if (!result) {
        throw new NotFoundException("Client not found");
      }

      return mapClientDetail(result.client, result.appointments);
    });
  }

  async updateClient(
    orgId: string,
    userId: string,
    clientId: string,
    input: UpdateClientInput,
  ) {
    return withTenantContext(this.db, orgId, userId, async (tx) => {
      const existing = await this.repo.findClientById(tx, orgId, clientId);
      if (!existing) {
        throw new NotFoundException("Client not found");
      }

      if (existing.client.phone_normalized === null && existing.client.name === "Cliente removido") {
        throw new DomainException(
          "ALREADY_ANONYMIZED",
          "Client is already anonymized",
          HttpStatus.CONFLICT,
        );
      }

      if (input.name === undefined && input.phone === undefined) {
        throw new HttpException(
          { error: { code: "VALIDATION_ERROR", message: "At least one field is required", details: [{ field: "name", issue: "required" }, { field: "phone", issue: "required" }] } },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      const updateData: {
        name?: string;
        phone?: string | null;
        phone_normalized?: string | null;
      } = {};

      if (input.name !== undefined) {
        if (input.name.trim().length === 0) {
          throw new HttpException(
            { error: { code: "VALIDATION_ERROR", message: "Name must not be blank", details: [{ field: "name", issue: "must_not_be_blank" }] } },
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }
        updateData.name = input.name;
      }

      if (input.phone !== undefined) {
        const normalized = input.phone ? normalizePhone(input.phone) : null;

        if (input.phone && !normalized) {
          throw new ValidationException("Invalid phone number", [
            { field: "phone", issue: "invalid_phone" },
          ]);
        }

        if (normalized) {
          const collision = await this.repo.findClientByPhoneNormalized(
            tx,
            orgId,
            normalized,
            clientId,
          );
          if (collision) {
            throw new DomainException(
              "PHONE_TAKEN",
              "Phone is already taken by another client",
              HttpStatus.CONFLICT,
            );
          }
        }

        updateData.phone = input.phone || null;
        updateData.phone_normalized = normalized;
      }

      if (Object.keys(updateData).length === 0) {
        const current = existing.client;
        return {
          id: current.id,
          name: current.name,
          phone: current.phone,
        };
      }

      const updated = await this.repo.updateClient(tx, orgId, clientId, updateData);

      return {
        id: updated!.id,
        name: updated!.name,
        phone: updated!.phone,
      };
    });
  }

  async anonymizeClient(
    orgId: string,
    userId: string,
    clientId: string,
  ): Promise<AnonymizeResponse> {
    return withTenantContext(this.db, orgId, userId, async (tx) => {
      const existing = await this.repo.findClientById(tx, orgId, clientId);
      if (!existing) {
        throw new NotFoundException("Client not found");
      }

      if (existing.client.phone_normalized === null && existing.client.name === "Cliente removido") {
        throw new DomainException(
          "ALREADY_ANONYMIZED",
          "Client is already anonymized",
          HttpStatus.CONFLICT,
        );
      }

      const result = await this.repo.anonymizeClient(tx, orgId, clientId);
      if (!result) {
        throw new NotFoundException("Client not found");
      }

      await this.repo.insertAudit(tx, {
        organization_id: orgId,
        actor_user_id: userId,
        action: "CLIENT_ANONYMIZED",
        target_type: "client",
        target_id: clientId,
        metadata: { clientId },
      });

      return { id: clientId, anonymized: true };
    });
  }
}
