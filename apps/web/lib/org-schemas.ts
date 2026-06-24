import { z } from "zod";

/**
 * Schema de formulário para edição de configurações da organização.
 *
 * Schema de UI, não contrato paralelo. O payload enviado obedece
 * API_CONTRACTS.md §9: name, timezone, slotIntervalMin.
 * `OrganizationDTO` do shared é usado para tipar a resposta.
 */

const TIMEZONES = new Set(
  (() => {
    try {
      return Intl.supportedValuesOf("timeZone") as string[];
    } catch {
      // Fallback: se o runtime não suportar, validação fica a cargo do backend.
      return null;
    }
  })(),
);

export const UpdateOrgSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  timezone: z.string().refine(
    (v) => TIMEZONES === null || TIMEZONES.has(v),
    "Fuso horário inválido",
  ),
  slotIntervalMin: z.coerce
    .number({ invalid_type_error: "Intervalo inválido" })
    .int("Intervalo deve ser inteiro")
    .min(5, "Mínimo 5 minutos")
    .max(240, "Máximo 240 minutos"),
});

export type UpdateOrgInput = z.infer<typeof UpdateOrgSchema>;
