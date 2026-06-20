import { Injectable, Inject } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { lt } from "drizzle-orm";
import { DbService } from "../db/db.service";
import { withSystemContext } from "../db/system-context";
import { refreshSessions, verificationTokens, invitations, idempotencyKeys } from "../../db/schema";
import { ScrubbedLogger } from "../common/logger/scrubbed-logger.service";

@Injectable()
export class MaintenanceService {
  private readonly logger = new ScrubbedLogger();

  constructor(@Inject(DbService) private readonly db: DbService) {}

  @Cron("0 * * * *")
  async cleanupRefreshSessions() {
    try {
      const result = await withSystemContext(this.db, async (tx) => {
        return tx
          .delete(refreshSessions)
          .where(lt(refreshSessions.expires_at, new Date()));
      });
      this.logger.log(
        `[maintenance] refresh_sessions: ${result.rowCount ?? 0} rows deleted`,
      );
    } catch (err) {
      this.logger.error(
        `[maintenance] refresh_sessions failed: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  }

  @Cron("15 * * * *")
  async cleanupVerificationTokens() {
    try {
      const result = await withSystemContext(this.db, async (tx) => {
        return tx
          .delete(verificationTokens)
          .where(lt(verificationTokens.expires_at, new Date()));
      });
      this.logger.log(
        `[maintenance] verification_tokens: ${result.rowCount ?? 0} rows deleted`,
      );
    } catch (err) {
      this.logger.error(
        `[maintenance] verification_tokens failed: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  }

  @Cron("30 * * * *")
  async cleanupInvitations() {
    try {
      const result = await withSystemContext(this.db, async (tx) => {
        return tx
          .delete(invitations)
          .where(lt(invitations.expires_at, new Date()));
      });
      this.logger.log(
        `[maintenance] invitations: ${result.rowCount ?? 0} rows deleted`,
      );
    } catch (err) {
      this.logger.error(
        `[maintenance] invitations failed: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  }

  @Cron("45 * * * *")
  async cleanupIdempotencyKeys() {
    try {
      const result = await withSystemContext(this.db, async (tx) => {
        return tx
          .delete(idempotencyKeys)
          .where(lt(idempotencyKeys.expires_at, new Date()));
      });
      this.logger.log(
        `[maintenance] idempotency_keys: ${result.rowCount ?? 0} rows deleted`,
      );
    } catch (err) {
      this.logger.error(
        `[maintenance] idempotency_keys failed: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  }
}
