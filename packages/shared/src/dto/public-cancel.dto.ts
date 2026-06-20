import { z } from "zod";

export const CancelPreviewInputSchema = z.object({
  token: z.string().min(1),
});

export type CancelPreviewInput = z.infer<typeof CancelPreviewInputSchema>;

export const CancelPreviewResponseSchema = z.object({
  professionalName: z.string(),
  serviceName: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
});

export type CancelPreviewResponse = z.infer<typeof CancelPreviewResponseSchema>;

export const CancelInputSchema = z.object({
  token: z.string().min(1),
});

export type CancelInput = z.infer<typeof CancelInputSchema>;
