import { z } from "zod";

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const RegisterSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  organizationName: z.string().min(1).optional(),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const SwitchOrgSchema = z.object({
  organizationId: z.string().uuid(),
});
export type SwitchOrgInput = z.infer<typeof SwitchOrgSchema>;

export const MeResponseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
  }),
  activeOrg: z.string().uuid().nullable(),
  memberships: z.array(
    z.object({
      organizationId: z.string().uuid(),
      role: z.enum(["OWNER", "MANAGER", "PROFESSIONAL"]),
      status: z.enum(["ACTIVE", "DISABLED"]),
    })
  ),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;
