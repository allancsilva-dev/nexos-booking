import { z } from "zod";

import { NAME_MAX } from "../limits.js";

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

const RoleEnum = z.enum(["OWNER", "MANAGER", "PROFESSIONAL"]);

export const UpdateOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  slotIntervalMin: z.number().int().min(5).max(240).optional(),
});

export type UpdateOrganizationInput = z.infer<typeof UpdateOrganizationSchema>;

export const InviteMemberSchema = z.object({
  email: z.string().trim().email().max(254),
  role: RoleEnum,
});

export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;

export const UpdateMemberSchema = z.object({
  role: RoleEnum.optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
});

export type UpdateMemberInput = z.infer<typeof UpdateMemberSchema>;
