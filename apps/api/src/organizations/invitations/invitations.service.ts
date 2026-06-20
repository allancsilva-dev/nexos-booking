import { Injectable, Inject } from "@nestjs/common";
import { randomBytes, createHash } from "node:crypto";

import { DbService } from "../../db";
import type { DbTransaction } from "../../db/db.types";
import { InvitationsRepository } from "./invitations.repository";
import { OrganizationsRepository } from "../organizations.repository";
import { PasswordService } from "../../auth/password/password.service";
import { JwtService } from "../../auth/jwt/jwt.service";
import { SessionService } from "../../auth/sessions/session.service";
import { ResendSender } from "../../auth/notifications/resend-sender";
import { auditLogs } from "../../../db/schema";
import {
  EmailNotVerifiedException,
  InviteTokenInvalidException,
  InviteTokenExpiredException,
  AlreadyMemberException,
} from "../../common/exceptions/domain.exception";

@Injectable()
export class InvitationsService {
  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject(InvitationsRepository) private readonly repo: InvitationsRepository,
    @Inject(OrganizationsRepository)
    private readonly orgRepo: OrganizationsRepository,
    @Inject(PasswordService) private readonly password: PasswordService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(SessionService) private readonly session: SessionService,
    @Inject(ResendSender)
    private readonly notification: ResendSender,
  ) {}

  async create(
    orgId: string,
    inviterUserId: string,
    email: string,
    role: string,
  ): Promise<{ id: string }> {
    return this.db.client.transaction(async (tx) => {
      const verif = await this.repo.findUserEmailVerified(tx, inviterUserId);
      if (!verif || !verif.emailVerifiedAt) {
        throw new EmailNotVerifiedException();
      }

      const normalizedEmail = email.toLowerCase().trim();

      const existing = await this.repo.findPendingByEmail(
        tx,
        orgId,
        normalizedEmail,
      );

      const plainToken = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(plainToken).digest("hex");
      const expiresAt = new Date(Date.now() + 7 * 86400_000);

      if (existing) {
        await this.repo.updateToken(tx, existing.id, tokenHash, expiresAt);
      } else {
        await this.repo.createInvitation(tx, {
          organizationId: orgId,
          email: normalizedEmail,
          role,
          tokenHash,
          invitedBy: inviterUserId,
          expiresAt,
        });
      }

      const inviter = await this.orgRepo.findUserById(tx, inviterUserId);
      const org = await this.orgRepo.findOrgById(tx, orgId);

      const invitationId = existing ? existing.id : undefined;

      this.notification
        .send("email", "invitation", normalizedEmail, {
          token: plainToken,
          orgName: org?.name ?? "",
          inviterName: inviter?.name ?? "",
        })
        .catch(() => {});

      const invId =
        invitationId ??
        (
          await this.repo.findPendingByEmail(tx, orgId, normalizedEmail)
        )?.id;

      await tx.insert(auditLogs).values({
        organization_id: orgId,
        actor_user_id: inviterUserId,
        action: "MEMBER_INVITED",
        target_type: "invitation",
        target_id: invId ?? undefined,
        metadata: { email: normalizedEmail, role },
      });

      return { id: invId ?? "" };
    });
  }

  async list(orgId: string) {
    return this.db.client.transaction(async (tx) => {
      return this.repo.findPendingByOrg(tx, orgId);
    });
  }

  async revoke(
    orgId: string,
    invitationId: string,
    actorUserId: string,
  ): Promise<void> {
    await this.db.client.transaction(async (tx) => {
      await this.repo.deleteInvitation(tx, invitationId);

      await tx.insert(auditLogs).values({
        organization_id: orgId,
        actor_user_id: actorUserId,
        action: "INVITATION_REVOKED",
        target_type: "invitation",
        target_id: invitationId,
      });
    });
  }

  async accept(
    token: string,
    userId?: string,
    name?: string,
    password?: string,
  ): Promise<{
    user?: { id: string; name: string; email: string };
    organization?: { id: string; name: string; slug: string };
    accessToken?: string;
    refreshToken?: string;
  }> {
    const tokenHash = createHash("sha256").update(token).digest("hex");

    return this.db.client.transaction(async (tx) => {
      const invitation = await this.repo.findByHash(tx, tokenHash);
      if (!invitation) {
        throw new InviteTokenInvalidException();
      }

      if (invitation.accepted_at) {
        throw new InviteTokenInvalidException();
      }

      if (new Date(invitation.expires_at) <= new Date()) {
        throw new InviteTokenExpiredException();
      }

      let resolvedUserId = userId;

      if (name && password) {
        if (password.length < 8) {
          throw new InviteTokenInvalidException();
        }

        const existingUser = await this.repo.findUserByEmail(
          tx,
          invitation.email,
        );
        if (existingUser) {
          resolvedUserId = existingUser.id;
        } else {
          const passwordHash = await this.password.hash(password);
          const user = await this.repo.createUser(tx, {
            name,
            email: invitation.email,
            passwordHash,
          });
          resolvedUserId = user.id;
        }
      }

      if (!resolvedUserId) {
        throw new InviteTokenInvalidException();
      }

      const existingMembership = await this.repo.findMembership(
        tx,
        invitation.organization_id,
        resolvedUserId,
      );
      if (existingMembership) {
        throw new AlreadyMemberException();
      }

      const accepted = await this.repo.markAccepted(tx, invitation.id);
      if (!accepted) {
        throw new InviteTokenInvalidException();
      }

      await this.repo.createMembership(tx, {
        organizationId: invitation.organization_id,
        userId: resolvedUserId,
        role: invitation.role,
        status: "ACTIVE",
      });

      const org = await this.orgRepo.findOrgById(
        tx,
        invitation.organization_id,
      );

      await tx.insert(auditLogs).values({
        organization_id: invitation.organization_id,
        actor_user_id: resolvedUserId,
        action: "INVITATION_ACCEPTED",
        target_type: "invitation",
        target_id: invitation.id,
        metadata: { role: invitation.role },
      });

      if (name && password) {
        const refreshToken = this.jwt.generateRefreshToken();

        const { familyId } = await this.session.create(tx, {
          userId: resolvedUserId,
          refreshToken,
          ttlSeconds: 86400 * 30,
        });

        const accessToken = await this.jwt.signAccess({
          sub: resolvedUserId,
          sid: familyId,
          org: invitation.organization_id,
        });

        const user = await this.repo.findUserByEmail(
          tx,
          invitation.email,
        );

        return {
          user: {
            id: resolvedUserId,
            name: user?.name ?? name,
            email: invitation.email,
          },
          organization: org
            ? { id: org.id, name: org.name, slug: org.slug }
            : undefined,
          accessToken,
          refreshToken,
        };
      }

      return {
        organization: org
          ? { id: org.id, name: org.name, slug: org.slug }
          : undefined,
      };
    });
  }

  async getInvitationByHash(tx: DbTransaction, hash: string) {
    return this.repo.findByHash(tx, hash);
  }
}
