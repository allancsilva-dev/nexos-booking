import { z } from "zod";

import { NAME_MAX, PRICE_CENTS_MAX, SERVICE_DURATION_MAX_MIN } from "../limits.js";

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

export const CreateServiceSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX),
  durationMin: z.number().int().positive().max(SERVICE_DURATION_MAX_MIN),
  bufferAfterMin: z.number().int().min(0).max(120).nullable().optional(),
  priceCents: z.number().int().min(0).max(PRICE_CENTS_MAX),
});

export type CreateServiceInput = z.infer<typeof CreateServiceSchema>;

export const UpdateServiceSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX).optional(),
  durationMin: z.number().int().positive().max(SERVICE_DURATION_MAX_MIN).optional(),
  bufferAfterMin: z.number().int().min(0).max(120).nullable().optional(),
  priceCents: z.number().int().min(0).max(PRICE_CENTS_MAX).optional(),
  active: z.boolean().optional(),
});

export type UpdateServiceInput = z.infer<typeof UpdateServiceSchema>;
