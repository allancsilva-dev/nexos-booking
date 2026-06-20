import { z } from "zod";

export const AvailabilityQuerySchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  serviceId: z.string().uuid(),
}).refine(d => d.from < d.to, { message: "from must be before to", path: ["from"] });

export const AvailabilitySlotSchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
});

export const AvailabilityDaySchema = z.object({
  date: z.string(), // YYYY-MM-DD
  slots: z.array(AvailabilitySlotSchema),
});

/** Volatile projection (ADR-013). Slots NOT guaranteed — POST INSERT is source of truth. */
export const AvailabilityResponseSchema = z.object({
  professionalId: z.string().uuid(),
  serviceId: z.string().uuid(),
  timezone: z.string(),
  slotIntervalMin: z.number().int().min(1),
  days: z.array(AvailabilityDaySchema),
});

export type AvailabilityQuery = z.infer<typeof AvailabilityQuerySchema>;
export type AvailabilityResponse = z.infer<typeof AvailabilityResponseSchema>;
export type AvailabilitySlot = z.infer<typeof AvailabilitySlotSchema>;
export type AvailabilityDay = z.infer<typeof AvailabilityDaySchema>;
