import { z } from "zod";

import { NAME_MAX, SLUG_MAX } from "../limits.js";

export const ProfessionalSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  active: z.boolean(),
  userId: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ProfessionalDTO = z.infer<typeof ProfessionalSchema>;

export const CreateProfessionalSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX),
  slug: z.string().trim().min(1).max(SLUG_MAX).optional(),
  userId: z.string().uuid().optional(),
});

export type CreateProfessionalInput = z.infer<typeof CreateProfessionalSchema>;

export const UpdateProfessionalSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX).optional(),
  slug: z.string().trim().min(1).max(SLUG_MAX).optional(),
  active: z.boolean().optional(),
  userId: z.string().uuid().nullable().optional(),
});

export type UpdateProfessionalInput = z.infer<typeof UpdateProfessionalSchema>;
