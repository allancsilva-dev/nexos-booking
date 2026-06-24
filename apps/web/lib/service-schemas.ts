import { z } from "zod";

/**
 * Schema de formulário para criação de serviço.
 *
 * Schemas de UI, não contrato paralelo. O payload enviado obedece
 * exatamente API_CONTRACTS.md §20.2. `ServiceDTO` do shared é usado
 * para tipar as respostas.
 */

export const CreateServiceSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  durationMin: z.coerce
    .number({ invalid_type_error: "Duração inválida" })
    .int("Duração deve ser inteira")
    .positive("Duração deve ser positiva"),
  priceCents: z.coerce
    .number({ invalid_type_error: "Preço inválido" })
    .int("Preço deve ser inteiro")
    .min(0, "Preço não pode ser negativo"),
  currency: z.preprocess(
    (val) => (val === "" || val === undefined ? undefined : val),
    z.string().length(3, "Moeda deve ter 3 caracteres").optional(),
  ),
});

export type CreateServiceInput = z.infer<typeof CreateServiceSchema>;

export const UpdateServiceSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").optional(),
  durationMin: z.coerce
    .number({ invalid_type_error: "Duração inválida" })
    .int("Duração deve ser inteira")
    .positive("Duração deve ser positiva")
    .optional(),
  priceCents: z.coerce
    .number({ invalid_type_error: "Preço inválido" })
    .int("Preço deve ser inteiro")
    .min(0, "Preço não pode ser negativo")
    .optional(),
  currency: z.preprocess(
    (val) => (val === "" || val === undefined ? undefined : val),
    z.string().length(3, "Moeda deve ter 3 caracteres").optional(),
  ),
  active: z.boolean().optional(),
});

export type UpdateServiceInput = z.infer<typeof UpdateServiceSchema>;
