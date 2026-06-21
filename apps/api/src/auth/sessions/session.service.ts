import { Injectable } from "@nestjs/common";
import { randomUUID, createHash } from "node:crypto";
import { eq, and, isNull, ne } from "drizzle-orm";

import type { DbTransaction } from "../../db/db.types";
import { refreshSessions } from "../../../db/schema";

export interface CreateSessionParams {
  userId: string;
  refreshToken: string;
  userAgent?: string;
  ip?: string;
  ttlSeconds?: number;
}

@Injectable()
export class SessionService {
  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  async create(
    tx: DbTransaction,
    params: CreateSessionParams,
  ): Promise<{ sessionId: string; familyId: string; expiresAt: Date }> {
    const familyId = randomUUID();
    const tokenHash = this.hashToken(params.refreshToken);
    const ttl = params.ttlSeconds ?? 86400 * 30;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttl * 1000);

    const [row] = await tx
      .insert(refreshSessions)
      .values({
        user_id: params.userId,
        token_hash: tokenHash,
        family_id: familyId,
        user_agent: params.userAgent ?? null,
        ip: params.ip ?? null,
        expires_at: expiresAt,
        created_at: now,
      })
      .returning({ id: refreshSessions.id });

    return { sessionId: row!.id, familyId, expiresAt };
  }

  async rotate(
    tx: DbTransaction,
    currentTokenHash: string,
    newRefreshToken: string,
    userAgent?: string,
    ip?: string,
    ttlSeconds?: number,
  ): Promise<{ familyId: string; expiresAt: Date; oldSessionId: string } | null> {
    const rows = await tx
      .select()
      .from(refreshSessions)
      .where(
        and(
          eq(refreshSessions.token_hash, currentTokenHash),
          isNull(refreshSessions.revoked_at),
        ),
      )
      .limit(1);

    if (rows.length === 0) return null;

    const session = rows[0]!;
    const ttl = ttlSeconds ?? 86400 * 30;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttl * 1000);
    const newTokenHash = this.hashToken(newRefreshToken);

    const [newRow] = await tx
      .insert(refreshSessions)
      .values({
        user_id: session.user_id,
        token_hash: newTokenHash,
        family_id: session.family_id,
        user_agent: userAgent ?? session.user_agent ?? null,
        ip: ip ?? session.ip ?? null,
        expires_at: expiresAt,
        created_at: now,
      })
      .returning({ id: refreshSessions.id });

    await tx
      .update(refreshSessions)
      .set({
        revoked_at: now,
        replaced_by: newRow!.id,
      })
      .where(eq(refreshSessions.id, session.id));

    return {
      familyId: session.family_id,
      expiresAt,
      oldSessionId: session.id,
    };
  }

  async detectReuse(
    tx: DbTransaction,
    tokenHash: string,
  ): Promise<{ reused: boolean; familyId: string | null }> {
    const rows = await tx
      .select()
      .from(refreshSessions)
      .where(eq(refreshSessions.token_hash, tokenHash))
      .limit(1);

    if (rows.length === 0) return { reused: false, familyId: null };

    const session = rows[0]!;

    if (session.revoked_at) {
      return { reused: true, familyId: session.family_id };
    }

    return { reused: false, familyId: session.family_id };
  }

  async revokeFamily(
    tx: DbTransaction,
    familyId: string,
  ): Promise<number> {
    const result = await tx
      .update(refreshSessions)
      .set({ revoked_at: new Date() })
      .where(
        and(
          eq(refreshSessions.family_id, familyId),
          isNull(refreshSessions.revoked_at),
        ),
      );

    return result.rowCount ?? 0;
  }

  async revokeFamilyBySid(
    tx: DbTransaction,
    familyId: string,
  ): Promise<void> {
    await tx
      .update(refreshSessions)
      .set({ revoked_at: new Date() })
      .where(
        and(
          eq(refreshSessions.family_id, familyId),
          isNull(refreshSessions.revoked_at),
        ),
      );
  }

  async revokeAllForUser(
    tx: DbTransaction,
    userId: string,
  ): Promise<string[]> {
    const rows = await tx
      .select({ family_id: refreshSessions.family_id })
      .from(refreshSessions)
      .where(
        and(
          eq(refreshSessions.user_id, userId),
          isNull(refreshSessions.revoked_at),
        ),
      );

    await tx
      .update(refreshSessions)
      .set({ revoked_at: new Date() })
      .where(
        and(
          eq(refreshSessions.user_id, userId),
          isNull(refreshSessions.revoked_at),
        ),
      );

    return [...new Set(rows.map((r) => r.family_id))];
  }

  async revokeAllForUserExceptFamily(
    tx: DbTransaction,
    userId: string,
    exceptFamilyId: string,
  ): Promise<string[]> {
    const rows = await tx
      .select({ family_id: refreshSessions.family_id })
      .from(refreshSessions)
      .where(
        and(
          eq(refreshSessions.user_id, userId),
          isNull(refreshSessions.revoked_at),
          ne(refreshSessions.family_id, exceptFamilyId),
        ),
      );

    await tx
      .update(refreshSessions)
      .set({ revoked_at: new Date() })
      .where(
        and(
          eq(refreshSessions.user_id, userId),
          isNull(refreshSessions.revoked_at),
          ne(refreshSessions.family_id, exceptFamilyId),
        ),
      );

    return [...new Set(rows.map((r) => r.family_id))];
  }
}
