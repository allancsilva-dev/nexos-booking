import { z } from "zod";

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
