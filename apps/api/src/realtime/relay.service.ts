import { Injectable, Inject } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { isNull, and, eq } from "drizzle-orm";
import { DbService } from "../db";
import { withSystemContext } from "../db/system-context";
import { appointmentEvents } from "../../db/schema";
import type { AppointmentEventPublisher, PublishedEvent } from "./publisher.interface";
import { ScrubbedLogger } from "../common/logger/scrubbed-logger.service";

const MAX_ATTEMPTS = 10;
const BATCH_SIZE = 50;

@Injectable()
export class OutboxRelayService {
  private readonly logger = new ScrubbedLogger();

  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject("AppointmentEventPublisher") private readonly publisher: AppointmentEventPublisher,
  ) {}

  @Cron("*/30 * * * * *")
  async processOutbox() {
    try {
      await withSystemContext(this.db, async (tx) => {
        const rows = await tx
          .select()
          .from(appointmentEvents)
          .where(and(isNull(appointmentEvents.published_at), isNull(appointmentEvents.publish_failed_at)))
          .limit(BATCH_SIZE)
          .for("update", { skipLocked: true });

        for (const row of rows) {
          try {
            const event: PublishedEvent = {
              appointmentId: row.appointment_id,
              professionalId: (row.metadata as Record<string, unknown>)?.professionalId as string ?? "",
              eventType: row.event_type,
              date: new Date(row.created_at).toISOString().split("T")[0]!,
              version: ((row.metadata as Record<string, unknown>)?.version as number) ?? 1,
              occurredAt: row.created_at.toISOString(),
              organizationId: row.organization_id,
            };
            await this.publisher.publish(event);
            await tx
              .update(appointmentEvents)
              .set({ published_at: new Date() })
              .where(and(isNull(appointmentEvents.published_at), eq(appointmentEvents.id, row.id)));
          } catch (err) {
            const attempts = row.publish_attempts + 1;
            const errorMsg = err instanceof Error ? err.message : "unknown";
            if (attempts >= MAX_ATTEMPTS) {
              await tx.update(appointmentEvents).set({ publish_attempts: attempts, last_publish_error: errorMsg, publish_failed_at: new Date() }).where(eq(appointmentEvents.id, row.id));
              this.logger.error(`[outbox-relay] event ${row.id} dead-lettered after ${MAX_ATTEMPTS} attempts`);
            } else {
              await tx.update(appointmentEvents).set({ publish_attempts: attempts, last_publish_error: errorMsg }).where(eq(appointmentEvents.id, row.id));
            }
          }
        }
      });
    } catch (err) {
      this.logger.error(`[outbox-relay] relay cycle failed: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }
}
