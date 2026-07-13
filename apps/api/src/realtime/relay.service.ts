import { Injectable, Inject } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { isNull, and, eq } from "drizzle-orm";
import { DbService } from "../db";
import { withSystemContext } from "../db/system-context";
import { appointmentEvents, appointments } from "../../db/schema";
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
            const metadata = row.metadata as Record<string, unknown>;
            let professionalId = typeof metadata?.professionalId === "string"
              ? metadata.professionalId
              : undefined;
            let startsAt = typeof metadata?.startsAt === "string"
              ? new Date(metadata.startsAt)
              : undefined;
            if (!professionalId || !startsAt || Number.isNaN(startsAt.getTime())) {
              const [appointment] = await tx
                .select({
                  professionalId: appointments.professional_id,
                  startsAt: appointments.starts_at,
                })
                .from(appointments)
                .where(eq(appointments.id, row.appointment_id))
                .limit(1);
              professionalId = appointment?.professionalId;
              startsAt = appointment?.startsAt;
            }
            if (!professionalId || !startsAt) {
              throw new Error("Appointment context unavailable for realtime event");
            }
            const event: PublishedEvent = {
              appointmentId: row.appointment_id,
              professionalId,
              eventType: row.event_type,
              date: startsAt.toISOString().split("T")[0]!,
              version: (metadata?.version as number) ?? 1,
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
