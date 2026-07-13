import { z } from "zod";

export const APPOINTMENT_REALTIME_EVENT_TYPES = [
  "CREATED",
  "RESCHEDULED",
  "CANCELLED",
  "COMPLETED",
  "NO_SHOW",
] as const;

export const AppointmentChangedEventSchema = z.object({
  appointmentId: z.string().uuid(),
  professionalId: z.string().uuid(),
  eventType: z.enum(APPOINTMENT_REALTIME_EVENT_TYPES),
  date: z.string().date(),
  version: z.number().int().positive(),
  occurredAt: z.string().datetime({ offset: true }),
}).strict();

export type AppointmentChangedEvent = z.infer<typeof AppointmentChangedEventSchema>;
