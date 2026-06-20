import { z } from "zod";

export const OrganizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  timezone: z.string(),
  slotIntervalMin: z.number().int().min(5).max(240),
  currency: z.string().length(3),
});

export const MemberSchema = z.object({
  userId: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(["OWNER", "MANAGER", "PROFESSIONAL"]),
  status: z.enum(["ACTIVE", "DISABLED"]),
});

export const InvitationSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["OWNER", "MANAGER", "PROFESSIONAL"]),
  invitedBy: z.string().uuid(),
  expiresAt: z.string(),
  createdAt: z.string(),
});

export type OrganizationDTO = z.infer<typeof OrganizationSchema>;
export type MemberDTO = z.infer<typeof MemberSchema>;
export type InvitationDTO = z.infer<typeof InvitationSchema>;
