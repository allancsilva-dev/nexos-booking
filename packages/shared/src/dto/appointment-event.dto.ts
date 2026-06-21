import { z } from "zod";

export const AppointmentEventSchema = z.object({
  id: z.string().uuid(),
  eventType: z.enum(["CREATED", "RESCHEDULED", "CANCELLED", "COMPLETED", "NO_SHOW"]),
  actorType: z.enum(["STAFF", "CLIENT", "SYSTEM"]),
  occurredAt: z.string(),
  metadata: z.record(z.string(), z.unknown()),
});
export type AppointmentEventDTO = z.infer<typeof AppointmentEventSchema>;
