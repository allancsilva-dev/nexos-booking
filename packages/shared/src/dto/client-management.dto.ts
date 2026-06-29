import { z } from "zod";

import { NAME_MAX, PHONE_MAX } from "../limits.js";

export const ClientListItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phone: z.string().nullable(),
  lastAppointmentAt: z.string().optional(),
  appointmentsCount: z.number().int().nonnegative().optional(),
});

export type ClientListItemDTO = z.infer<typeof ClientListItemSchema>;

export const ClientDetailSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phone: z.string().nullable(),
  appointments: z.array(
    z.object({
      id: z.string().uuid(),
      professionalId: z.string().uuid(),
      serviceId: z.string().uuid(),
      startsAt: z.string(),
      endsAt: z.string(),
      status: z.string(),
      source: z.string(),
    }),
  ),
});

export type ClientDetailDTO = z.infer<typeof ClientDetailSchema>;

export const UpdateClientSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX).optional(),
  phone: z.string().trim().max(PHONE_MAX).optional(),
});

export type UpdateClientInput = z.infer<typeof UpdateClientSchema>;

export const AnonymizeResponseSchema = z.object({
  id: z.string().uuid(),
  anonymized: z.literal(true),
});

export type AnonymizeResponse = z.infer<typeof AnonymizeResponseSchema>;
