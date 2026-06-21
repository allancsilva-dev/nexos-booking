import { z } from "zod";

export const AppointmentListItemSchema = z.object({
  id: z.string().uuid(),
  startsAt: z.string(),
  endsAt: z.string(),
  status: z.enum(["SCHEDULED", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"]),
  professionalId: z.string().uuid(),
  serviceId: z.string().uuid(),
  clientName: z.string(),
  clientPhone: z.string().nullable(),
  version: z.number().int(),
  source: z.enum(["PANEL", "PUBLIC"]),
});
export type AppointmentListItemDTO = z.infer<typeof AppointmentListItemSchema>;

export const AppointmentListResponseSchema = z.object({
  items: z.array(AppointmentListItemSchema),
  nextCursor: z.string().nullable(),
});
export type AppointmentListResponse = z.infer<typeof AppointmentListResponseSchema>;
