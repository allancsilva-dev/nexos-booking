import {
  Injectable,
  Inject,
  HttpException,
  HttpStatus,
  forwardRef,
} from "@nestjs/common";
import { RateLimitException } from "../common/exceptions/rate-limit.exception";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";

import { applyTenantContext, DbService } from "../db";
import type { DbTransaction } from "../db/db.types";
import { refreshSessions, auditLogs } from "../../db/schema";
import { PasswordService } from "./password/password.service";
import { JwtService } from "./jwt/jwt.service";
import { SessionService } from "./sessions/session.service";
import { AuthRepository } from "./auth.repository";
import { MemoryRateLimiter } from "./rate-limit/rate-limiter.memory";
import type { RateLimiter } from "./rate-limit/rate-limiter.interface";
import { ResendSender } from "./notifications/resend-sender";
import type { RegisterInput } from "./dto/register.dto";
import type { LoginInput } from "./dto/login.dto";
import type { SwitchOrgInput } from "./dto/switch-org.dto";
import { InvitationsService } from "../organizations/invitations/invitations.service";
import {
  AuthzDeniedException,
  EmailTakenException,
  InvalidCredentialsException,
  NoActiveOrgException,
  RefreshReusedException,
  SlugTakenException,
  TokenExpiredException,
} from "../common/exceptions/domain.exception";
import { ValidationException } from "../common/exceptions/validation.exception";
import { generateSlugCandidates } from "../organizations/slug-generator";

const SLUG_MAX_RETRIES = 10;
const REGISTER_ORG_INSERT_SAVEPOINT = "register_org_insert";

async function setCurrentUserContext(
  tx: DbTransaction,
  userId: string,
): Promise<void> {
  await tx.execute(
    sql`SELECT set_config('app.current_user_id', ${userId}, true)`,
  );
}

@Injectable()
export class AuthService {
  private readonly rateLimiter: RateLimiter;

  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject(PasswordService) private readonly password: PasswordService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(SessionService) private readonly session: SessionService,
    @Inject(AuthRepository) private readonly repo: AuthRepository,
    @Inject(ResendSender) private readonly notification: ResendSender,
    @Inject(forwardRef(() => InvitationsService))
    private readonly invitations: InvitationsService,
  ) {
    this.rateLimiter = new MemoryRateLimiter();
  }

  async register(
    input: RegisterInput,
    ip: string,
    options?: { failAfterUser?: boolean },
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; name: string; email: string };
    organization: { id: string; name: string; slug: string };
  }> {
    const rlResult = await this.rateLimiter.consume(
      `register:ip:${ip}`,
      3,
      3600_000,
    );

    if (!rlResult.allowed) {
      throw new RateLimitException(
        Math.ceil((rlResult.resetAt - Date.now()) / 1000),
      );
    }

    if (!input.password || input.password.length < 8) {
      throw new ValidationException("Invalid input", [
        { field: "password", issue: "Password must be at least 8 characters" },
      ]);
    }

    const normalizedEmail = input.email.toLowerCase().trim();

    return this.db.client.transaction(async (tx) => {
      const existing = await this.repo.findUserByEmail(tx, normalizedEmail);
      if (existing) {
        throw new EmailTakenException();
      }

      const passwordHash = await this.password.hash(input.password);

      const user = await this.repo.createUser(tx, {
        name: input.name,
        email: normalizedEmail,
        passwordHash,
      });

      if (options?.failAfterUser) {
        throw new Error("Test register failure after user creation");
      }

      const orgName = input.organizationName || `${input.name}'s Organization`;
      const organizationId = randomUUID();
      await applyTenantContext(tx, organizationId, user.id);

      const org = await this.createBootstrapOrganization(tx, {
        id: organizationId,
        name: orgName,
      });

      await this.repo.createMembership(tx, {
        organizationId: org.id,
        userId: user.id,
        role: "OWNER",
        status: "ACTIVE",
      });

      const refreshToken = this.jwt.generateRefreshToken();

      const { familyId } = await this.session.create(tx, {
        userId: user.id,
        refreshToken,
        ip,
        ttlSeconds: 86400 * 30,
      });

      const accessToken = await this.jwt.signAccess({
        sub: user.id,
        sid: familyId,
        org: org.id,
      });

      return {
        accessToken,
        refreshToken,
        user: { id: user.id, name: user.name, email: user.email },
        organization: { id: org.id, name: org.name, slug: org.slug },
      };
    });
  }

  async login(
    input: LoginInput,
    ip: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; name: string; email: string };
    activeOrg: string | null;
  }> {
    const normalizedEmail = input.email.toLowerCase().trim();

    const ipResult = await this.rateLimiter.consume(
      `login:ip:${ip}`,
      10,
      60_000,
    );
    if (!ipResult.allowed) {
      throw new RateLimitException(
        Math.ceil((ipResult.resetAt - Date.now()) / 1000),
      );
    }

    const emailResult = await this.rateLimiter.consume(
      `login:email:${normalizedEmail}`,
      5,
      60_000,
    );
    if (!emailResult.allowed) {
      throw new RateLimitException(
        Math.ceil((emailResult.resetAt - Date.now()) / 1000),
      );
    }

    return this.db.client.transaction(async (tx) => {
      const user = await this.repo.findUserByEmail(tx, normalizedEmail);
      if (!user) {
        throw new InvalidCredentialsException();
      }

      const valid = await this.password.verify(
        user.password_hash,
        input.password,
      );
      if (!valid) {
        throw new InvalidCredentialsException();
      }

      await setCurrentUserContext(tx, user.id);
      const memberships = await this.repo.findMemberships(tx, user.id);

      if (memberships.length === 0) {
        throw new NoActiveOrgException();
      }

      const refreshToken = this.jwt.generateRefreshToken();

      const { familyId } = await this.session.create(tx, {
        userId: user.id,
        refreshToken,
        ip,
        ttlSeconds: 86400 * 30,
      });

      let org: string | undefined;
      if (memberships.length === 1) {
        org = memberships[0]!.organization_id;
      }

      const accessToken = await this.jwt.signAccess({
        sub: user.id,
        sid: familyId,
        org,
      });

      return {
        accessToken,
        refreshToken,
        user: { id: user.id, name: user.name, email: user.email },
        activeOrg: org ?? null,
      };
    });
  }

  async refresh(
    token: string,
    ip: string,
    userAgent?: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; name: string; email: string };
    activeOrg: string | null;
  }> {
    const rlResult = await this.rateLimiter.consume(
      `refresh:ip:${ip}`,
      30,
      60_000,
    );
    if (!rlResult.allowed) {
      throw new RateLimitException(
        Math.ceil((rlResult.resetAt - Date.now()) / 1000),
      );
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");

    const reuse = await this.db.client.transaction(async (tx) => {
      return this.session.detectReuse(tx, tokenHash);
    });

    if (reuse.reused && reuse.familyId) {
      await this.db.client.transaction(async (tx) => {
        await this.session.revokeFamily(tx, reuse.familyId!);
      });
      throw new RefreshReusedException();
    }

    return this.db.client.transaction(async (tx) => {
      const newRefreshToken = this.jwt.generateRefreshToken();

      const rotated = await this.session.rotate(
        tx,
        tokenHash,
        newRefreshToken,
        userAgent,
        ip,
        86400 * 30,
      );

      if (!rotated) {
        throw new TokenExpiredException();
      }

      const sessionRow = await tx
        .select({ user_id: refreshSessions.user_id })
        .from(refreshSessions)
        .where(eq(refreshSessions.family_id, rotated.familyId))
        .limit(1);

      if (sessionRow.length === 0) {
        throw new TokenExpiredException();
      }

      const userId = sessionRow[0]!.user_id;

      const user = await this.repo.findUserById(tx, userId);
      if (!user) {
        throw new TokenExpiredException();
      }

      await setCurrentUserContext(tx, user.id);
      const memberships = await this.repo.findMemberships(tx, user.id);

      let org: string | undefined;
      if (memberships.length === 1) {
        org = memberships[0]!.organization_id;
      }

      const accessToken = await this.jwt.signAccess({
        sub: user.id,
        sid: rotated.familyId,
        org,
      });

      return {
        accessToken,
        refreshToken: newRefreshToken,
        user: { id: user.id, name: user.name, email: user.email },
        activeOrg: org ?? null,
      };
    });
  }

  async logout(sid: string): Promise<void> {
    await this.db.client.transaction(async (tx) => {
      await this.session.revokeFamilyBySid(tx, sid);
    });
  }

  async me(userId: string, orgId?: string) {
    return this.db.client.transaction(async (tx) => {
      const user = await this.repo.findUserById(tx, userId);
      if (!user) {
        throw new InvalidCredentialsException();
      }

      await setCurrentUserContext(tx, userId);
      const memberships = await this.repo.findOrganizationsForUser(
        tx,
        userId,
      );

      let activeOrg = orgId ?? null;
      if (!activeOrg && memberships.length === 1) {
        activeOrg = memberships[0]!.organizationId;
      } else if (activeOrg) {
        const isActive = memberships.some(
          (m) => m.organizationId === activeOrg && m.status === "ACTIVE",
        );
        if (!isActive) {
          activeOrg = null;
        }
      }

      return {
        user: { id: user.id, name: user.name, email: user.email },
        activeOrg,
        memberships: memberships.map((m) => ({
          organizationId: m.organizationId,
          name: m.name,
          slug: m.slug,
          role: m.role,
          status: m.status,
        })),
      };
    });
  }

  async switchOrg(
    userId: string,
    sid: string,
    input: SwitchOrgInput,
  ): Promise<{ accessToken: string }> {
    return this.db.client.transaction(async (tx) => {
      await setCurrentUserContext(tx, userId);
      const membership = await this.repo.findMembership(
        tx,
        userId,
        input.organizationId,
      );

      if (!membership) {
        throw new AuthzDeniedException();
      }

      if (membership.status === "DISABLED") {
        throw new AuthzDeniedException();
      }

      const accessToken = await this.jwt.signAccess({
        sub: userId,
        sid,
        org: input.organizationId,
      });

      return { accessToken };
    });
  }

  async verifyEmail(token: string): Promise<{ verified: boolean }> {
    const tokenHash = createHash("sha256").update(token).digest("hex");

    return this.db.client.transaction(async (tx) => {
      const record = await this.repo.findVerificationTokenByHash(
        tx,
        tokenHash,
        "EMAIL_VERIFY",
      );

      if (!record) {
        throw new HttpException(
          "Verification token not found",
          HttpStatus.GONE,
        );
      }

      if (record.used_at) {
        throw new HttpException(
          "Verification token has already been used",
          HttpStatus.GONE,
        );
      }

      if (new Date(record.expires_at) <= new Date()) {
        throw new HttpException(
          "Verification token has expired",
          HttpStatus.GONE,
        );
      }

      const consumed = await this.repo.consumeToken(tx, record.id);
      if (!consumed) {
        throw new HttpException(
          "Verification token has already been used",
          HttpStatus.GONE,
        );
      }

      await this.repo.updateEmailVerifiedAt(tx, record.user_id);

      await tx.insert(auditLogs).values({
        actor_user_id: record.user_id,
        action: "EMAIL_VERIFIED",
        target_type: "user",
        target_id: record.user_id,
      });

      return { verified: true };
    });
  }

  async resendVerification(userId: string): Promise<void> {
    const rlResult = await this.rateLimiter.consume(
      `resend:user:${userId}`,
      3,
      3600_000,
    );
    if (!rlResult.allowed) {
      throw new RateLimitException(
        Math.ceil((rlResult.resetAt - Date.now()) / 1000),
      );
    }

    const user = await this.db.client.transaction(async (tx) => {
      return this.repo.findUserById(tx, userId);
    });

    if (!user) {
      throw new HttpException("User not found", HttpStatus.NOT_FOUND);
    }

    const plainToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(plainToken).digest("hex");

    await this.db.client.transaction(async (tx) => {
      await this.repo.invalidatePreviousTokens(
        tx,
        userId,
        "EMAIL_VERIFY",
      );

      await this.repo.createVerificationToken(tx, {
        userId,
        purpose: "EMAIL_VERIFY",
        tokenHash,
        expiresAt: new Date(Date.now() + 24 * 3600_000),
      });
    });

    this.notification
      .send("email", "verify-email", user.email, {
        token: plainToken,
        name: user.name,
      })
      .catch(() => {});
  }

  async forgotPassword(email: string, ip: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();

    const emailResult = await this.rateLimiter.consume(
      `forgot:email:${normalizedEmail}`,
      3,
      3600_000,
    );
    if (!emailResult.allowed) {
      throw new RateLimitException(
        Math.ceil((emailResult.resetAt - Date.now()) / 1000),
      );
    }

    const ipResult = await this.rateLimiter.consume(
      `forgot:ip:${ip}`,
      10,
      3600_000,
    );
    if (!ipResult.allowed) {
      throw new RateLimitException(
        Math.ceil((ipResult.resetAt - Date.now()) / 1000),
      );
    }

    void createHash("sha256").update(normalizedEmail).digest("hex");

    return this.db.client.transaction(async (tx) => {
      const user = await this.repo.findUserByEmail(tx, normalizedEmail);

      if (user) {
        const plainToken = randomBytes(32).toString("hex");
        const tokenHash = createHash("sha256")
          .update(plainToken)
          .digest("hex");

        await this.repo.createVerificationToken(tx, {
          userId: user.id,
          purpose: "PASSWORD_RESET",
          tokenHash,
          expiresAt: new Date(Date.now() + 24 * 3600_000),
        });

        this.notification
          .send("email", "password-reset", user.email, {
            token: plainToken,
            name: user.name,
          })
          .catch(() => {});
      } else {
        void randomBytes(32).toString("hex");
        void createHash("sha256")
          .update(randomBytes(32).toString("hex"))
          .digest("hex");
      }
    });
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ success: boolean }> {
    if (newPassword.length < 8) {
      throw new HttpException(
        "Password must be at least 8 characters",
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");

    return this.db.client.transaction(async (tx) => {
      const record = await this.repo.findVerificationTokenByHash(
        tx,
        tokenHash,
        "PASSWORD_RESET",
      );

      if (!record) {
        throw new HttpException(
          "Reset token not found",
          HttpStatus.GONE,
        );
      }

      if (record.used_at) {
        throw new HttpException(
          "Reset token has already been used",
          HttpStatus.GONE,
        );
      }

      if (new Date(record.expires_at) <= new Date()) {
        throw new HttpException(
          "Reset token has expired",
          HttpStatus.GONE,
        );
      }

      const consumed = await this.repo.consumeToken(tx, record.id);
      if (!consumed) {
        throw new HttpException(
          "Reset token has already been used",
          HttpStatus.GONE,
        );
      }

      const passwordHash = await this.password.hash(newPassword);

      await this.repo.updatePasswordHash(tx, record.user_id, passwordHash);

      const familyIds = await this.session.revokeAllForUser(
        tx,
        record.user_id,
      );

      await tx.insert(auditLogs).values({
        actor_user_id: record.user_id,
        action: "PASSWORD_CHANGED",
        target_type: "user",
        target_id: record.user_id,
      });

      await tx.insert(auditLogs).values({
        actor_user_id: record.user_id,
        action: "SESSION_REVOKED",
        target_type: "user",
        target_id: record.user_id,
        metadata: {
          count: familyIds.length,
          reason: "password_reset",
        },
      });

      return { success: true };
    });
  }

  async changePassword(
    userId: string,
    currentFamilyId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean }> {
    if (newPassword.length < 8) {
      throw new HttpException(
        "Password must be at least 8 characters",
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    if (newPassword === currentPassword) {
      throw new HttpException(
        "New password must be different from current password",
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    return this.db.client.transaction(async (tx) => {
      const user = await this.repo.findUserById(tx, userId);
      if (!user) {
        throw new InvalidCredentialsException();
      }

      const valid = await this.password.verify(
        user.password_hash,
        currentPassword,
      );
      if (!valid) {
        throw new InvalidCredentialsException("Current password is incorrect");
      }

      const newHash = await this.password.hash(newPassword);

      await this.repo.updatePasswordHash(tx, userId, newHash);

      const familyIds =
        await this.session.revokeAllForUserExceptFamily(
          tx,
          userId,
          currentFamilyId,
        );

      await tx.insert(auditLogs).values({
        actor_user_id: userId,
        action: "PASSWORD_CHANGED",
        target_type: "user",
        target_id: userId,
      });

      await tx.insert(auditLogs).values({
        actor_user_id: userId,
        action: "SESSION_REVOKED",
        target_type: "user",
        target_id: userId,
        metadata: {
          count: familyIds.length,
          reason: "password_change",
        },
      });

      return { success: true };
    });
  }

  async acceptInvite(
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
    const rlResult = await this.rateLimiter.consume(
      `accept-invite:ip:${token.slice(0, 8)}`,
      10,
      3600_000,
    );
    if (!rlResult.allowed) {
      throw new RateLimitException(
        Math.ceil((rlResult.resetAt - Date.now()) / 1000),
      );
    }

    return this.invitations.accept(token, userId, name, password);
  }

  private async generateSlug(
    _tx: DbTransaction,
    name: string,
  ): Promise<string[]> {
    return generateSlugCandidates(name).slice(0, SLUG_MAX_RETRIES);
  }

  private async createBootstrapOrganization(
    tx: DbTransaction,
    params: { id: string; name: string },
  ) {
    const candidates = await this.generateSlug(tx, params.name);

    for (const candidate of candidates) {
      await tx.execute(sql.raw(`SAVEPOINT ${REGISTER_ORG_INSERT_SAVEPOINT}`));

      try {
        const org = await this.repo.createOrganization(tx, {
          id: params.id,
          name: params.name,
          slug: candidate,
        });
        await tx.execute(sql.raw(`RELEASE SAVEPOINT ${REGISTER_ORG_INSERT_SAVEPOINT}`));
        return org;
      } catch (error) {
        await tx.execute(
          sql.raw(`ROLLBACK TO SAVEPOINT ${REGISTER_ORG_INSERT_SAVEPOINT}`),
        );

        if (!this.isUniqueViolation(error)) {
          throw error;
        }
      }
    }

    throw new SlugTakenException();
  }

  private isUniqueViolation(error: unknown): boolean {
    const pgError = error as { code?: string; cause?: { code?: string } };
    return (
      pgError.code === "23505" ||
      (typeof pgError.cause === "object" && pgError.cause?.code === "23505")
    );
  }
}
