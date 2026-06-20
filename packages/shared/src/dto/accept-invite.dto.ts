import { z } from "zod";

export const AcceptInviteSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1).optional(),
  password: z.string().min(8).optional(),
});

export type AcceptInviteInput = z.infer<typeof AcceptInviteSchema>;
