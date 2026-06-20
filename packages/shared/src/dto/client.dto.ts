import { z } from "zod";

export const ClientSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phone: z.string().nullable(),
  createdAt: z.string(),
});

export type ClientDTO = z.infer<typeof ClientSchema>;
