import { Injectable } from "@nestjs/common";
import { eq, and, isNull } from "drizzle-orm";
import type { DbTransaction } from "../db/db.types";
import {
  users,
  organizations,
  organizationUsers,
  verificationTokens,
} from "../../db/schema";

@Injectable()
export class AuthRepository {
  async findUserByEmail(
    tx: DbTransaction,
    email: string,
  ) {
    const rows = await tx
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);
    return rows[0] ?? null;
  }

  async createUser(
    tx: DbTransaction,
    params: {
      name: string;
      email: string;
      passwordHash: string;
    },
  ) {
    const [row] = await tx
      .insert(users)
      .values({
        name: params.name,
        email: params.email.toLowerCase().trim(),
        password_hash: params.passwordHash,
      })
      .returning();
    return row!;
  }

  async createOrganization(
    tx: DbTransaction,
    params: { id: string; name: string; slug: string },
  ) {
    const [row] = await tx
      .insert(organizations)
      .values({
        id: params.id,
        name: params.name,
        slug: params.slug,
      })
      .returning();
    return row!;
  }

  async createMembership(
    tx: DbTransaction,
    params: {
      organizationId: string;
      userId: string;
      role: string;
      status: string;
    },
  ) {
    const [row] = await tx
      .insert(organizationUsers)
      .values({
        organization_id: params.organizationId,
        user_id: params.userId,
        role: params.role,
        status: params.status,
      })
      .returning();
    return row!;
  }

  async findMemberships(
    tx: DbTransaction,
    userId: string,
  ) {
    return tx
      .select()
      .from(organizationUsers)
      .where(
        and(
          eq(organizationUsers.user_id, userId),
          eq(organizationUsers.status, "ACTIVE"),
        ),
      );
  }

  async findMembership(
    tx: DbTransaction,
    userId: string,
    organizationId: string,
  ) {
    const rows = await tx
      .select()
      .from(organizationUsers)
      .where(
        and(
          eq(organizationUsers.user_id, userId),
          eq(organizationUsers.organization_id, organizationId),
          eq(organizationUsers.status, "ACTIVE"),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async findOrganizationsForUser(
    tx: DbTransaction,
    userId: string,
  ) {
    return tx
      .select({
        organizationId: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        role: organizationUsers.role,
        status: organizationUsers.status,
      })
      .from(organizationUsers)
      .innerJoin(
        organizations,
        eq(organizationUsers.organization_id, organizations.id),
      )
      .where(
        and(
          eq(organizationUsers.user_id, userId),
          eq(organizationUsers.status, "ACTIVE"),
        ),
      );
  }

  async findUserById(tx: DbTransaction, userId: string) {
    const rows = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  async createVerificationToken(
    tx: DbTransaction,
    params: {
      userId: string;
      purpose: string;
      tokenHash: string;
      expiresAt: Date;
    },
  ) {
    const [row] = await tx
      .insert(verificationTokens)
      .values({
        user_id: params.userId,
        purpose: params.purpose,
        token_hash: params.tokenHash,
        expires_at: params.expiresAt,
      })
      .returning();
    return row!;
  }

  async findVerificationTokenByHash(
    tx: DbTransaction,
    hash: string,
    purpose: string,
  ) {
    const rows = await tx
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.token_hash, hash),
          eq(verificationTokens.purpose, purpose),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async consumeToken(
    tx: DbTransaction,
    id: string,
  ): Promise<boolean> {
    const result = await tx
      .update(verificationTokens)
      .set({ used_at: new Date() })
      .where(
        and(
          eq(verificationTokens.id, id),
          isNull(verificationTokens.used_at),
        ),
      );
    return (result.rowCount ?? 0) === 1;
  }

  async invalidatePreviousTokens(
    tx: DbTransaction,
    userId: string,
    purpose: string,
  ): Promise<void> {
    await tx
      .update(verificationTokens)
      .set({ used_at: new Date() })
      .where(
        and(
          eq(verificationTokens.user_id, userId),
          eq(verificationTokens.purpose, purpose),
          isNull(verificationTokens.used_at),
        ),
      );
  }

  async updateEmailVerifiedAt(
    tx: DbTransaction,
    userId: string,
  ): Promise<void> {
    await tx
      .update(users)
      .set({ email_verified_at: new Date() })
      .where(eq(users.id, userId));
  }

  async updatePasswordHash(
    tx: DbTransaction,
    userId: string,
    hash: string,
  ): Promise<void> {
    await tx
      .update(users)
      .set({ password_hash: hash })
      .where(eq(users.id, userId));
  }
}
