import {
  Injectable,
  Inject,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import { RateLimitException } from "../common/exceptions/rate-limit.exception";
import { randomUUID, createHash } from "node:crypto";
import { eq } from "drizzle-orm";

import { DbService } from "../db";
import type { DbTransaction } from "../db/db.types";
import { organizations, refreshSessions } from "../../db/schema";
import { PasswordService } from "./password/password.service";
import { JwtService } from "./jwt/jwt.service";
import { SessionService } from "./sessions/session.service";
import { AuthRepository } from "./auth.repository";
import { MemoryRateLimiter } from "./rate-limit/rate-limiter.memory";
import type { RateLimiter } from "./rate-limit/rate-limiter.interface";
import type { RegisterInput } from "./dto/register.dto";
import type { LoginInput } from "./dto/login.dto";
import type { SwitchOrgInput } from "./dto/switch-org.dto";

const SLUG_MAX_RETRIES = 10;
const RESERVED_SLUGS = new Set([
  "admin", "api", "app", "login", "auth", "public",
  "barbearia", "barbeiro", "static", "assets", "root",
  "www", "mail", "ftp", "cdn", "docs", "help", "suporte",
  "support", "status", "api-docs",
]);

@Injectable()
export class AuthService {
  private readonly rateLimiter: RateLimiter;

  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject(PasswordService) private readonly password: PasswordService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(SessionService) private readonly session: SessionService,
    @Inject(AuthRepository) private readonly repo: AuthRepository,
  ) {
    this.rateLimiter = new MemoryRateLimiter();
  }

  async register(
    input: RegisterInput,
    ip: string,
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
      throw new ForbiddenException("Password must be at least 8 characters");
    }

    const normalizedEmail = input.email.toLowerCase().trim();

    return this.db.client.transaction(async (tx) => {
      const existing = await this.repo.findUserByEmail(tx, normalizedEmail);
      if (existing) {
        throw new ConflictException("Email already registered");
      }

      const passwordHash = await this.password.hash(input.password);

      const user = await this.repo.createUser(tx, {
        name: input.name,
        email: normalizedEmail,
        passwordHash,
      });

      const orgName = input.organizationName || `${input.name}'s Organization`;
      const slug = await this.generateSlug(tx, orgName);

      const org = await this.repo.createOrganization(tx, {
        name: orgName,
        slug,
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
        throw new UnauthorizedException("Invalid credentials");
      }

      const valid = await this.password.verify(
        user.password_hash,
        input.password,
      );
      if (!valid) {
        throw new UnauthorizedException("Invalid credentials");
      }

      const memberships = await this.repo.findMemberships(tx, user.id);

      if (memberships.length === 0) {
        throw new ForbiddenException("No active organization");
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
      throw new UnauthorizedException("Token reused");
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
        throw new UnauthorizedException("Invalid refresh token");
      }

      const sessionRow = await tx
        .select({ user_id: refreshSessions.user_id })
        .from(refreshSessions)
        .where(eq(refreshSessions.family_id, rotated.familyId))
        .limit(1);

      if (sessionRow.length === 0) {
        throw new UnauthorizedException("Invalid refresh token");
      }

      const userId = sessionRow[0]!.user_id;

      const user = await this.repo.findUserById(tx, userId);
      if (!user) {
        throw new UnauthorizedException("User not found");
      }

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
        throw new UnauthorizedException("User not found");
      }

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
      const membership = await this.repo.findMembership(
        tx,
        userId,
        input.organizationId,
      );

      if (!membership) {
        throw new ForbiddenException("Authorization denied");
      }

      if (membership.status === "DISABLED") {
        throw new ForbiddenException("Authorization denied");
      }

      const accessToken = await this.jwt.signAccess({
        sub: userId,
        sid,
        org: input.organizationId,
      });

      return { accessToken };
    });
  }

  private async generateSlug(
    tx: DbTransaction,
    name: string,
  ): Promise<string> {
    let base = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-");

    if (!base || base.length < 2) {
      base = `org-${randomUUID().slice(0, 8)}`;
    }

    if (RESERVED_SLUGS.has(base)) {
      base = `${base}-org`;
    }

    for (let attempt = 0; attempt < SLUG_MAX_RETRIES; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const existing = await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, candidate))
        .limit(1);

      if (existing.length === 0) {
        return candidate;
      }
    }

    return `${base}-${randomUUID().slice(0, 8)}`;
  }
}
