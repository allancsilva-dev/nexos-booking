import { z } from "zod";

export const APPOINTMENT_STATUSES = [
  "SCHEDULED",
  "CONFIRMED",
  "CANCELLED",
  "COMPLETED",
  "NO_SHOW",
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_TRANSITIONS: Record<
  AppointmentStatus,
  readonly (AppointmentStatus | "RESCHEDULED")[]
> = {
  CONFIRMED: ["CANCELLED", "COMPLETED", "NO_SHOW", "RESCHEDULED"],
  SCHEDULED: ["CANCELLED", "RESCHEDULED"],
  CANCELLED: [],
  COMPLETED: [],
  NO_SHOW: [],
} as const;

export function isAllowedTransition(
  from: AppointmentStatus,
  target: string,
): target is AppointmentStatus | "RESCHEDULED" {
  const allowed = APPOINTMENT_TRANSITIONS[from] as readonly string[];
  return allowed.includes(target);
}

export function isTerminal(status: AppointmentStatus): boolean {
  return APPOINTMENT_TRANSITIONS[status].length === 0;
}

export const AppointmentSchema = z.object({
  id: z.string().uuid(),
  professionalId: z.string().uuid(),
  serviceId: z.string().uuid(),
  clientId: z.string().uuid(),
  clientName: z.string(),
  clientPhone: z.string().nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
  status: z.enum(APPOINTMENT_STATUSES),
  source: z.enum(["PANEL", "PUBLIC"]),
  note: z.string().nullable(),
  version: z.number().int(),
  serviceNameSnapshot: z.string(),
  serviceDurationMinSnapshot: z.number().int().positive(),
  servicePriceCentsSnapshot: z.number().int().min(0),
  serviceCurrencySnapshot: z.string().length(3),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AppointmentDTO = z.infer<typeof AppointmentSchema>;

export const CreateAppointmentSchema = z.object({
  professionalId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  client: z.object({ name: z.string().min(1), phone: z.string().min(1) }),
  note: z.string().max(2000).optional(),
  allowOutsideHours: z.boolean().optional().default(false),
});

export type CreateAppointmentInput = z.infer<typeof CreateAppointmentSchema>;

export const RescheduleSchema = z
  .object({
    startsAt: z.string().datetime({ offset: true }).optional(),
    note: z.string().max(2000).optional(),
  })
  .refine((d) => d.startsAt !== undefined || d.note !== undefined, {
    message: "At least one of startsAt or note is required",
  });

export type RescheduleInput = z.infer<typeof RescheduleSchema>;
