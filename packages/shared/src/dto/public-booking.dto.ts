import { z } from "zod";

export const MAX_BOOKING_HORIZON_DAYS = 90;
export const MIN_SCHEDULE_NOTICE_MIN = 15;

export const PublicBookingInputSchema = z.object({
  professionalSlug: z.string().min(1),
  serviceId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  client: z.object({
    name: z.string().min(1),
    phone: z.string().min(1),
  }),
  consent: z.literal(true),
});

export type PublicBookingInput = z.infer<typeof PublicBookingInputSchema>;

export const PublicBookingResponseSchema = z.object({
  id: z.string().uuid(),
  startsAt: z.string(),
  endsAt: z.string(),
  status: z.string(),
  professional: z.object({ name: z.string() }),
  service: z.object({
    name: z.string(),
    durationMin: z.number().int().positive(),
    serviceNameSnapshot: z.string(),
    serviceDurationMinSnapshot: z.number().int().positive(),
  }),
  cancelUrl: z.string(),
});

export type PublicBookingResponse = z.infer<typeof PublicBookingResponseSchema>;
