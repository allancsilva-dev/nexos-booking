import { z } from "zod";

export const AvailabilityBlockSchema = z.object({
  id: z.string().uuid(),
  professionalId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  reason: z.string().max(500).nullable(),
  createdAt: z.string(),
});
export type AvailabilityBlockDTO = z.infer<typeof AvailabilityBlockSchema>;

export const CreateBlockSchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  reason: z.string().max(500).optional(),
}).refine((d) => d.startsAt < d.endsAt, { message: "startsAt must be before endsAt", path: ["startsAt"] });
export type CreateBlockInput = z.infer<typeof CreateBlockSchema>;
