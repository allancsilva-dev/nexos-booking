import {
  Injectable,
  Inject,
  NotFoundException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { sql } from "drizzle-orm";

import { DbService } from "../db";
import { OrganizationsRepository } from "./organizations.repository";
import { SessionService } from "../auth/sessions/session.service";
import { auditLogs } from "../../db/schema";
import {
  LastOwnerException,
  SlugTakenException,
} from "../common/exceptions/domain.exception";
import {
  generateSlugCandidates,
  isReservedSlug,
} from "./slug-generator";
import type { UpdateOrganizationInput } from "./dto/update-organization.dto";
import type { UpdateMemberInput } from "./dto/update-member.dto";

const SLUG_MAX_RETRIES = 10;

@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject(OrganizationsRepository) private readonly repo: OrganizationsRepository,
    @Inject(SessionService) private readonly session: SessionService,
  ) {}

  async me(userId: string) {
    return this.db.client.transaction(async (tx) => {
      return this.repo.findOrganizationsForUser(tx, userId);
    });
  }

  async getById(orgId: string, userId: string) {
    return this.db.client.transaction(async (tx) => {
      const org = await this.repo.findOrgById(tx, orgId);
      if (!org) {
        throw new NotFoundException("Organization not found");
      }

      const membership = await this.repo.findMembership(tx, orgId, userId);
      if (!membership || membership.status !== "ACTIVE") {
        throw new NotFoundException("Organization not found");
      }

      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        timezone: org.timezone,
        slotIntervalMin: org.slot_interval_min,
        currency: org.currency,
      };
    });
  }

  async update(
    orgId: string,
    userId: string,
    input: UpdateOrganizationInput,
  ) {
    if (input.timezone !== undefined) {
      try {
        Intl.supportedValuesOf("timeZone");
      } catch {
        throw new HttpException(
          "Invalid timezone",
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      const validZones = Intl.supportedValuesOf("timeZone");
      if (!validZones.includes(input.timezone)) {
        throw new HttpException(
          "Invalid timezone",
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
    }

    if (input.slotIntervalMin !== undefined) {
      if (input.slotIntervalMin < 5 || input.slotIntervalMin > 240) {
        throw new HttpException(
          "slotIntervalMin must be between 5 and 240",
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
    }

    return this.db.client.transaction(async (tx) => {
      const membership = await this.repo.findMembership(tx, orgId, userId);
      if (!membership || membership.status !== "ACTIVE") {
        throw new NotFoundException("Organization not found");
      }

      const org = await this.repo.findOrgById(tx, orgId);
      if (!org) {
        throw new NotFoundException("Organization not found");
      }

      if (input.name !== undefined && input.name !== org.name) {
        const candidates = generateSlugCandidates(input.name);

        if (isReservedSlug(candidates[0]!.split("-")[0]!)) {
          throw new HttpException(
            "Slug is reserved",
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }

        let selectedSlug: string | null = null;

        for (
          let i = 0;
          i < candidates.length && i < SLUG_MAX_RETRIES;
          i++
        ) {
          const candidate = candidates[i]!;

          await tx.execute(sql`SAVEPOINT slug_attempt`);

          try {
            await this.repo.updateOrg(tx, orgId, {
              name: input.name,
              slug: candidate,
            });
            await tx.execute(sql`RELEASE SAVEPOINT slug_attempt`);
            selectedSlug = candidate;
            break;
          } catch (err) {
            await tx.execute(
              sql`ROLLBACK TO SAVEPOINT slug_attempt`,
            );

            const pgErr = err as {
              code?: string;
              cause?: { code?: string };
            };
            const code =
              pgErr.code ??
              (pgErr.cause && typeof pgErr.cause === "object"
                ? (pgErr.cause as { code?: string }).code
                : undefined);

            if (code !== "23505") {
              throw err;
            }
          }
        }

        if (!selectedSlug) {
          throw new SlugTakenException();
        }
      }

      if (
        input.timezone !== undefined ||
        input.slotIntervalMin !== undefined
      ) {
        const extraData: Record<string, unknown> = {};
        if (input.timezone !== undefined)
          extraData.timezone = input.timezone;
        if (input.slotIntervalMin !== undefined)
          extraData.slotIntervalMin = input.slotIntervalMin;
        await this.repo.updateOrg(tx, orgId, extraData);
      }

      const updated = await this.repo.findOrgById(tx, orgId);

      await tx.insert(auditLogs).values({
        organization_id: orgId,
        actor_user_id: userId,
        action: "ORGANIZATION_UPDATED",
        target_type: "organization",
        target_id: orgId,
      });

      return {
        id: updated!.id,
        name: updated!.name,
        slug: updated!.slug,
        timezone: updated!.timezone,
        slotIntervalMin: updated!.slot_interval_min,
        currency: updated!.currency,
      };
    });
  }

  async getMembers(orgId: string) {
    return this.db.client.transaction(async (tx) => {
      return this.repo.findMemberships(tx, orgId);
    });
  }

  async updateMember(
    orgId: string,
    actorUserId: string,
    targetUserId: string,
    input: UpdateMemberInput,
  ) {
    return this.db.client.transaction(async (tx) => {
      const targetMembership = await this.repo.findMembership(
        tx,
        orgId,
        targetUserId,
      );
      if (!targetMembership) {
        throw new NotFoundException("Member not found");
      }

      if (targetMembership.status !== "ACTIVE") {
        throw new HttpException(
          "Authorization denied",
          HttpStatus.FORBIDDEN,
        );
      }

      if (
        input.role !== undefined &&
        input.role !== targetMembership.role
      ) {
        const owners = await this.repo.lockActiveOwners(tx, orgId);
        if (owners.length === 1 && owners[0]!.id === targetMembership.id) {
          await this.db.client.insert(auditLogs).values({
            organization_id: orgId,
            actor_user_id: actorUserId,
            action: "LAST_OWNER_REJECTED",
            target_type: "user",
            target_id: targetUserId,
            metadata: { attemptedRole: input.role },
          });
          throw new LastOwnerException();
        }
      }

      if (input.status === "DISABLED") {
        const owners = await this.repo.lockActiveOwners(tx, orgId);
        if (owners.length === 1 && owners[0]!.id === targetMembership.id) {
          await this.db.client.insert(auditLogs).values({
            organization_id: orgId,
            actor_user_id: actorUserId,
            action: "LAST_OWNER_REJECTED",
            target_type: "user",
            target_id: targetUserId,
          });
          throw new LastOwnerException();
        }

        await this.repo.updateMembership(tx, orgId, targetUserId, {
          status: "DISABLED",
        });

        const revokedCount = await this.session.revokeAllForUser(
          tx,
          targetUserId,
        );

        await tx.insert(auditLogs).values({
          organization_id: orgId,
          actor_user_id: actorUserId,
          action: "MEMBER_DISABLED",
          target_type: "user",
          target_id: targetUserId,
        });

        await tx.insert(auditLogs).values({
          organization_id: orgId,
          actor_user_id: actorUserId,
          action: "SESSION_REVOKED",
          target_type: "user",
          target_id: targetUserId,
          metadata: {
            count: revokedCount,
            reason: "member_disabled",
          },
        });

        return this.repo.findMembership(tx, orgId, targetUserId);
      }

      if (input.role !== undefined || input.status !== undefined) {
        await this.repo.updateMembership(tx, orgId, targetUserId, {
          role: input.role,
          status: input.status,
        });

        await tx.insert(auditLogs).values({
          organization_id: orgId,
          actor_user_id: actorUserId,
          action: "ROLE_CHANGED",
          target_type: "user",
          target_id: targetUserId,
          metadata: input.role ? { role: input.role } : undefined,
        });
      }

      return this.repo.findMembership(tx, orgId, targetUserId);
    });
  }
}
