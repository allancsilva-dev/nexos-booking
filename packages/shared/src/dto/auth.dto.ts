import { z } from "zod";

export const RegisterInputSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(8),
  organizationName: z.string().trim().min(1).optional(),
});

export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export const LoginInputSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;

export const SwitchOrgInputSchema = z.object({
  organizationId: z.string().uuid(),
});

export type SwitchOrgInput = z.infer<typeof SwitchOrgInputSchema>;

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
      name: z.string(),
      slug: z.string(),
      role: z.enum(["OWNER", "MANAGER", "PROFESSIONAL"]),
      status: z.enum(["ACTIVE", "DISABLED"]),
    }),
  ),
});

export type MeResponse = z.infer<typeof MeResponseSchema>;
