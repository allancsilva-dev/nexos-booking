import {
  Injectable,
  Inject,
  NotFoundException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";

import { DbService } from "../db";
import { withTenantContext } from "../db/tenant-context";
import { ServicesRepository } from "./services.repository";
import { auditLogs } from "../../db/schema";
import type { CreateServiceInput } from "./dto/create-service.dto";
import type { UpdateServiceInput } from "./dto/update-service.dto";
import {
  normalizeBufferAfterMin,
  validateBufferAfterMin,
} from "../scheduling/occupied-interval.util";

function mapService(row: {
  id: string;
  organization_id: string;
  name: string;
  duration_min: number;
  buffer_after_min: number | null;
  price_cents: number;
  currency: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    durationMin: row.duration_min,
    bufferAfterMin: row.buffer_after_min,
    priceCents: row.price_cents,
    currency: row.currency,
    active: row.active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

@Injectable()
export class ServicesService {
  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject(ServicesRepository)
    private readonly repo: ServicesRepository,
  ) {}

  async findAll(orgId: string) {
    return withTenantContext(this.db, orgId, null, async (tx) => {
      const rows = await this.repo.findAll(tx, orgId);
      return rows.map(mapService);
    });
  }

  async create(
    orgId: string,
    userId: string,
    input: CreateServiceInput,
  ) {
    return withTenantContext(this.db, orgId, userId, async (tx) => {
      if (input.durationMin <= 0) {
        throw new HttpException(
          {
            error: {
              code: "VALIDATION_ERROR",
              details: { field: "durationMin", issue: "must_be_positive" },
            },
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      if (input.priceCents < 0) {
        throw new HttpException(
          {
            error: {
              code: "VALIDATION_ERROR",
              details: { field: "priceCents", issue: "must_be_non_negative" },
            },
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      const bufferValidation = validateBufferAfterMin(input.bufferAfterMin);
      if (!bufferValidation.valid) {
        throw new HttpException(
          {
            error: {
              code: "VALIDATION_ERROR",
              details: {
                field: "bufferAfterMin",
                issue: bufferValidation.issue,
              },
            },
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      const service = await this.repo.create(tx, {
        organization_id: orgId,
        name: input.name,
        duration_min: input.durationMin,
        buffer_after_min: normalizeBufferAfterMin(input.bufferAfterMin),
        price_cents: input.priceCents,
        active: true,
      });

      await tx.insert(auditLogs).values({
        organization_id: orgId,
        actor_user_id: userId,
        action: "SERVICE_CREATED",
        target_type: "service",
        target_id: service.id,
        metadata: { serviceId: service.id },
      });

      return mapService(service);
    });
  }

  async update(
    orgId: string,
    id: string,
    userId: string,
    input: UpdateServiceInput,
  ) {
    return withTenantContext(this.db, orgId, userId, async (tx) => {
      const service = await this.repo.findById(tx, orgId, id);
      if (!service) {
        throw new NotFoundException("Service not found");
      }

      if (
        input.durationMin !== undefined &&
        input.durationMin <= 0
      ) {
        throw new HttpException(
          {
            error: {
              code: "VALIDATION_ERROR",
              details: { field: "durationMin", issue: "must_be_positive" },
            },
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      if (
        input.priceCents !== undefined &&
        input.priceCents < 0
      ) {
        throw new HttpException(
          {
            error: {
              code: "VALIDATION_ERROR",
              details: { field: "priceCents", issue: "must_be_non_negative" },
            },
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      if (input.bufferAfterMin !== undefined) {
        const bufferValidation = validateBufferAfterMin(input.bufferAfterMin);
        if (!bufferValidation.valid) {
          throw new HttpException(
            {
              error: {
                code: "VALIDATION_ERROR",
                details: {
                  field: "bufferAfterMin",
                  issue: bufferValidation.issue,
                },
              },
            },
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }
      }

      const changedFields: string[] = [];

      if (
        input.name !== undefined &&
        input.name !== service.name
      ) {
        changedFields.push("name");
      }

      if (
        input.durationMin !== undefined &&
        input.durationMin !== service.duration_min
      ) {
        changedFields.push("durationMin");
      }

      if (
        input.priceCents !== undefined &&
        input.priceCents !== service.price_cents
      ) {
        changedFields.push("priceCents");
      }

      if (
        input.bufferAfterMin !== undefined &&
        normalizeBufferAfterMin(input.bufferAfterMin) !==
          normalizeBufferAfterMin(service.buffer_after_min)
      ) {
        changedFields.push("bufferAfterMin");
      }

      if (
        input.active !== undefined &&
        input.active !== service.active
      ) {
        changedFields.push("active");
      }

      const data: Record<string, unknown> = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.durationMin !== undefined) data.duration_min = input.durationMin;
      if (input.bufferAfterMin !== undefined) {
        data.buffer_after_min = normalizeBufferAfterMin(input.bufferAfterMin);
      }
      if (input.priceCents !== undefined) data.price_cents = input.priceCents;
      if (input.active !== undefined) data.active = input.active;

      await this.repo.update(tx, orgId, id, data);

      const updated = await this.repo.findById(tx, orgId, id);

      await tx.insert(auditLogs).values({
        organization_id: orgId,
        actor_user_id: userId,
        action: "SERVICE_UPDATED",
        target_type: "service",
        target_id: id,
        metadata: { serviceId: id, changedFields },
      });

      return mapService(updated!);
    });
  }
}
