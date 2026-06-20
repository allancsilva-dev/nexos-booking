import {
  Injectable,
  Inject,
  NotFoundException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { sql } from "drizzle-orm";

import { DbService } from "../db";
import { withTenantContext } from "../db/tenant-context";
import { ProfessionalsRepository } from "./professionals.repository";
import { auditLogs } from "../../db/schema";
import {
  SlugTakenException,
  SlugReservedException,
  ProfessionalUserTakenException,
} from "../common/exceptions/domain.exception";
import {
  generateSlugCandidates,
  isReservedSlug,
} from "../organizations/slug-generator";
import type { CreateProfessionalInput } from "./dto/create-professional.dto";
import type { UpdateProfessionalInput } from "./dto/update-professional.dto";

const SLUG_MAX_RETRIES = 10;

function isUniqueViolation(err: unknown): boolean {
  const pgErr = err as {
    code?: string;
    cause?: { code?: string };
  };
  const code =
    pgErr.code ??
    (pgErr.cause && typeof pgErr.cause === "object"
      ? (pgErr.cause as { code?: string }).code
      : undefined);
  return code === "23505";
}

function getConstraint(err: unknown): string | undefined {
  const pgErr = err as {
    constraint?: string;
    cause?: { constraint?: string };
  };
  return (
    pgErr.constraint ??
    (pgErr.cause && typeof pgErr.cause === "object"
      ? (pgErr.cause as { constraint?: string }).constraint
      : undefined)
  );
}

function mapProfessional(row: {
  id: string;
  organization_id: string;
  user_id: string | null;
  name: string;
  slug: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    active: row.active,
    userId: row.user_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

@Injectable()
export class ProfessionalsService {
  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject(ProfessionalsRepository)
    private readonly repo: ProfessionalsRepository,
  ) {}

  async findAll(orgId: string) {
    return withTenantContext(this.db, orgId, null, async (tx) => {
      const rows = await this.repo.findAll(tx, orgId);
      return rows.map(mapProfessional);
    });
  }

  async create(
    orgId: string,
    userId: string,
    input: CreateProfessionalInput,
  ) {
    return withTenantContext(this.db, orgId, userId, async (tx) => {
      if (input.userId) {
        const ok = await this.repo.findMembershipActive(tx, orgId, input.userId);
        if (!ok) {
          throw new HttpException(
            {
              error: {
                code: "VALIDATION_ERROR",
                details: { userId: "no_active_membership" },
              },
            },
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }
      }

      let slugCandidates: string[];
      if (input.slug) {
        if (isReservedSlug(input.slug)) {
          throw new SlugReservedException();
        }
        slugCandidates = [input.slug];
      } else {
        slugCandidates = generateSlugCandidates(input.name);
      }

      let selectedSlug: string | null = null;
      let professional: Awaited<ReturnType<typeof this.repo.create>> | null =
        null;

      for (
        let i = 0;
        i < slugCandidates.length && i < SLUG_MAX_RETRIES;
        i++
      ) {
        const candidate = slugCandidates[i]!;

        await tx.execute(sql`SAVEPOINT slug_attempt`);

        try {
          professional = await this.repo.create(tx, {
            organization_id: orgId,
            name: input.name,
            slug: candidate,
            user_id: input.userId ?? null,
          });
          await tx.execute(sql`RELEASE SAVEPOINT slug_attempt`);
          selectedSlug = candidate;
          break;
        } catch (err) {
          await tx.execute(sql`ROLLBACK TO SAVEPOINT slug_attempt`);

          if (!isUniqueViolation(err)) {
            throw err;
          }

          const constraint = getConstraint(err);
          if (constraint === "professionals_org_user_uk") {
            throw new ProfessionalUserTakenException();
          }
        }
      }

      if (!selectedSlug || !professional) {
        throw new SlugTakenException();
      }

      await tx.insert(auditLogs).values({
        organization_id: orgId,
        actor_user_id: userId,
        action: "PROFESSIONAL_CREATED",
        target_type: "professional",
        target_id: professional.id,
        metadata: { professionalId: professional.id },
      });

      return mapProfessional(professional);
    });
  }

  async update(
    orgId: string,
    id: string,
    userId: string,
    input: UpdateProfessionalInput,
  ) {
    return withTenantContext(this.db, orgId, userId, async (tx) => {
      const professional = await this.repo.findById(tx, orgId, id);
      if (!professional) {
        throw new NotFoundException("Professional not found");
      }

      const changedFields: string[] = [];

      if (
        input.userId !== undefined &&
        input.userId !== professional.user_id
      ) {
        if (input.userId !== null) {
          const ok = await this.repo.findMembershipActive(
            tx,
            orgId,
            input.userId,
          );
          if (!ok) {
            throw new HttpException(
              {
                error: {
                  code: "VALIDATION_ERROR",
                  details: { userId: "no_active_membership" },
                },
              },
              HttpStatus.UNPROCESSABLE_ENTITY,
            );
          }
        }

        try {
          await this.repo.update(tx, orgId, id, {
            user_id: input.userId,
          });
          changedFields.push("userId");
        } catch (err) {
          if (
            isUniqueViolation(err) &&
            getConstraint(err) === "professionals_org_user_uk"
          ) {
            throw new ProfessionalUserTakenException();
          }
          throw err;
        }
      }

      const nameChanged =
        input.name !== undefined && input.name !== professional.name;
      const slugProvided = input.slug !== undefined;

      if (nameChanged) {
        changedFields.push("name");

        if (slugProvided) {
          if (isReservedSlug(input.slug!)) {
            throw new SlugReservedException();
          }

          try {
            await this.repo.update(tx, orgId, id, {
              name: input.name,
              slug: input.slug,
            });
            changedFields.push("slug");
          } catch (err) {
            if (
              isUniqueViolation(err) &&
              getConstraint(err) === "professionals_org_slug_uk"
            ) {
              throw new SlugTakenException();
            }
            throw err;
          }
        } else {
          const candidates = generateSlugCandidates(input.name!);
          let selectedSlug: string | null = null;

          for (
            let i = 0;
            i < candidates.length && i < SLUG_MAX_RETRIES;
            i++
          ) {
            const candidate = candidates[i]!;

            await tx.execute(sql`SAVEPOINT slug_attempt`);

            try {
              await this.repo.update(tx, orgId, id, {
                name: input.name,
                slug: candidate,
              });
              await tx.execute(sql`RELEASE SAVEPOINT slug_attempt`);
              selectedSlug = candidate;
              changedFields.push("slug");
              break;
            } catch (err) {
              await tx.execute(
                sql`ROLLBACK TO SAVEPOINT slug_attempt`,
              );

              if (!isUniqueViolation(err)) {
                throw err;
              }
            }
          }

          if (!selectedSlug) {
            throw new SlugTakenException();
          }
        }
      } else if (
        slugProvided &&
        input.slug !== professional.slug
      ) {
        if (isReservedSlug(input.slug!)) {
          throw new SlugReservedException();
        }

        try {
          await this.repo.update(tx, orgId, id, {
            slug: input.slug,
          });
          changedFields.push("slug");
        } catch (err) {
          if (
            isUniqueViolation(err) &&
            getConstraint(err) === "professionals_org_slug_uk"
          ) {
            throw new SlugTakenException();
          }
          throw err;
        }
      }

      if (
        input.active !== undefined &&
        input.active !== professional.active
      ) {
        await this.repo.update(tx, orgId, id, {
          active: input.active,
        });
        changedFields.push("active");
      }

      const updated = await this.repo.findById(tx, orgId, id);

      await tx.insert(auditLogs).values({
        organization_id: orgId,
        actor_user_id: userId,
        action: "PROFESSIONAL_UPDATED",
        target_type: "professional",
        target_id: id,
        metadata: { professionalId: id, changedFields },
      });

      return mapProfessional(updated!);
    });
  }
}
