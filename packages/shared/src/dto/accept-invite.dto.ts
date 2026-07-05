import { z } from "zod";

import { NAME_MAX } from "../limits.js";
import { passwordSchema } from "./auth.dto.js";

export const AcceptInviteSchema = z.object({
  token: z.string().min(1).max(512),
  name: z.string().trim().min(1).max(NAME_MAX).optional(),
  password: passwordSchema.optional(),
});

export type AcceptInviteInput = z.infer<typeof AcceptInviteSchema>;
