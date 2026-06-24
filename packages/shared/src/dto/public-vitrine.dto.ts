import { z } from "zod";

export const PublicServiceSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  durationMin: z.number().int().positive(),
  priceCents: z.number().int().min(0),
  currency: z.string().length(3),
  professionalSlugs: z.array(z.string()),
});

export const PublicProfessionalSummarySchema = z.object({
  slug: z.string(),
  name: z.string(),
});

export const PublicVitrineResponseSchema = z.object({
  name: z.string(),
  slug: z.string(),
  timezone: z.string(),
  services: z.array(PublicServiceSummarySchema),
  professionals: z.array(PublicProfessionalSummarySchema),
});

export type PublicVitrineResponse = z.infer<typeof PublicVitrineResponseSchema>;
