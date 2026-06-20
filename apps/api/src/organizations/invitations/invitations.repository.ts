import { Injectable } from "@nestjs/common";
import { eq, and, isNull, sql } from "drizzle-orm";
import type { DbTransaction } from "../../db/db.types";
import {
  invitations,
  users,
  organizationUsers,
} from "../../../db/schema";

@Injectable()
export class InvitationsRepository {
  async createInvitation(
    tx: DbTransaction,
    data: {
      organizationId: string;
      email: string;
      role: string;
      tokenHash: string;
      invitedBy: string;
      expiresAt: Date;
    },
  ) {
    const [row] = await tx
      .insert(invitations)
      .values({
        organization_id: data.organizationId,
        email: data.email.toLowerCase().trim(),
        role: data.role,
        token_hash: data.tokenHash,
        invited_by: data.invitedBy,
        expires_at: data.expiresAt,
      })
      .returning();
    return row!;
  }

  async findByHash(tx: DbTransaction, hash: string) {
    const rows = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.token_hash, hash))
      .limit(1);
    return rows[0] ?? null;
  }

  async findPendingByOrg(tx: DbTransaction, orgId: string) {
    return tx
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        invitedBy: invitations.invited_by,
        expiresAt: invitations.expires_at,
        createdAt: invitations.created_at,
      })
      .from(invitations)
      .where(
        and(
          eq(invitations.organization_id, orgId),
          isNull(invitations.accepted_at),
        ),
      );
  }

  async findPendingByEmail(
    tx: DbTransaction,
    orgId: string,
    email: string,
  ) {
    const rows = await tx
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.organization_id, orgId),
          eq(sql`lower(${invitations.email})`, email.toLowerCase().trim()),
          isNull(invitations.accepted_at),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async updateToken(
    tx: DbTransaction,
    id: string,
    tokenHash: string,
    expiresAt: Date,
  ) {
    await tx
      .update(invitations)
      .set({ token_hash: tokenHash, expires_at: expiresAt })
      .where(eq(invitations.id, id));
  }

  async markAccepted(tx: DbTransaction, id: string): Promise<boolean> {
    const result = await tx
      .update(invitations)
      .set({ accepted_at: new Date() })
      .where(
        and(
          eq(invitations.id, id),
          isNull(invitations.accepted_at),
        ),
      );
    return (result.rowCount ?? 0) === 1;
  }

  async deleteInvitation(tx: DbTransaction, id: string) {
    await tx.delete(invitations).where(eq(invitations.id, id));
  }

  async findUserEmailVerified(tx: DbTransaction, userId: string) {
    const rows = await tx
      .select({ emailVerifiedAt: users.email_verified_at })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  async findUserByEmail(tx: DbTransaction, email: string) {
    const rows = await tx
      .select()
      .from(users)
      .where(eq(sql`lower(${users.email})`, email.toLowerCase().trim()))
      .limit(1);
    return rows[0] ?? null;
  }

  async createUser(
    tx: DbTransaction,
    data: { name: string; email: string; passwordHash: string },
  ) {
    const [row] = await tx
      .insert(users)
      .values({
        name: data.name,
        email: data.email.toLowerCase().trim(),
        password_hash: data.passwordHash,
      })
      .returning();
    return row!;
  }

  async findMembership(
    tx: DbTransaction,
    orgId: string,
    userId: string,
  ) {
    const rows = await tx
      .select()
      .from(organizationUsers)
      .where(
        and(
          eq(organizationUsers.organization_id, orgId),
          eq(organizationUsers.user_id, userId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async createMembership(
    tx: DbTransaction,
    data: {
      organizationId: string;
      userId: string;
      role: string;
      status: string;
    },
  ) {
    const [row] = await tx
      .insert(organizationUsers)
      .values({
        organization_id: data.organizationId,
        user_id: data.userId,
        role: data.role,
        status: data.status,
      })
      .returning();
    return row!;
  }
}
