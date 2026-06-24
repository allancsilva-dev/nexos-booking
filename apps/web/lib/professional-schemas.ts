import { z } from "zod";

/**
 * Schemas de formulário para criação/edição de profissionais.
 *
 * Schemas de UI, não contrato paralelo. `userId` não é exposto no formulário
 * (sem seletor de membro seguro no MVP). O backend aceita userId null/omitido.
 */

export const CreateProfessionalSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  slug: z.string().min(1).optional(),
});

export const UpdateProfessionalSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").optional(),
  slug: z.string().min(1).optional(),
  active: z.boolean().optional(),
});

export type CreateProfessionalInput = z.infer<typeof CreateProfessionalSchema>;
export type UpdateProfessionalInput = z.infer<typeof UpdateProfessionalSchema>;
