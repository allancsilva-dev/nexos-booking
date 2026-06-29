import { z } from "zod";

import { NAME_MAX, PASSWORD_MAX, PASSWORD_MIN } from "../limits.js";

/** Política de senha única, reutilizada por register/reset/change/accept-invite. */
export const passwordSchema = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);

export const RegisterInputSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX),
  email: z.string().trim().email().max(254),
  password: passwordSchema,
  organizationName: z.string().trim().min(1).max(NAME_MAX).optional(),
});

export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export const LoginInputSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(PASSWORD_MAX),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;

export const ForgotPasswordSchema = z.object({
  email: z.string().trim().email().max(254),
});

export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z.object({
  token: z.string().min(1).max(512),
  newPassword: passwordSchema,
});

export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

export const PasswordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX),
  newPassword: passwordSchema,
});

export type PasswordChangeInput = z.infer<typeof PasswordChangeSchema>;

export const VerifyEmailSchema = z.object({
  token: z.string().min(1).max(512),
});

export type VerifyEmailInput = z.infer<typeof VerifyEmailSchema>;

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
