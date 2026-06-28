import { z } from "zod";

export const ServiceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  durationMin: z.number().int().positive(),
  bufferAfterMin: z.number().int().min(0).max(120).nullable(),
  priceCents: z.number().int().min(0),
  currency: z.string().length(3),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ServiceDTO = z.infer<typeof ServiceSchema>;
