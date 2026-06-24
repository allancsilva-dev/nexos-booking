import { z } from "zod";

/**
 * Schema para o body do PUT /professionals/:id/services.
 *
 * API_CONTRACTS.md §20.1 — substituição total da lista de serviços vinculados.
 */
export const ProfessionalServicesInputSchema = z.object({
  serviceIds: z.array(z.string().uuid()),
});

/** Schema para resposta de GET/PUT /professionals/:id/services. */
export const ProfessionalServicesResponseSchema = z.object({
  professionalId: z.string().uuid(),
  serviceIds: z.array(z.string().uuid()),
});

export type ProfessionalServicesInput = z.infer<
  typeof ProfessionalServicesInputSchema
>;
export type ProfessionalServicesResponse = z.infer<
  typeof ProfessionalServicesResponseSchema
>;
