/**
 * Catálogo canônico de `error.code` do contrato HTTP (API_CONTRACTS.md §7 + §22).
 *
 * Cresce de forma aditiva e é a única fonte de verdade dos códigos de erro: web/api/mobile
 * importam, não redefinem. Divergência aqui é bug de build, não de runtime.
 *
 * NÃO inclui `CONSENT_REQUIRED`: por §22, consentimento ausente é representado como
 * `VALIDATION_ERROR` com `details` (recomendação do contrato, para não inflar o catálogo).
 */
export const ERROR_CODES = [
  // Genéricos
  "VALIDATION_ERROR",
  "BAD_REQUEST",
  "NOT_FOUND",
  "INTERNAL_ERROR",
  "RATE_LIMITED",
  // Auth
  "UNAUTHENTICATED",
  "INVALID_CREDENTIALS",
  "TOKEN_EXPIRED",
  "REFRESH_REUSED",
  "EMAIL_NOT_VERIFIED",
  "VERIFICATION_TOKEN_INVALID",
  "VERIFICATION_TOKEN_EXPIRED",
  "EMAIL_TAKEN",
  "NO_ACTIVE_ORG",
  // Convite
  "INVITE_TOKEN_INVALID",
  "INVITE_TOKEN_EXPIRED",
  "ALREADY_MEMBER",
  // Authorization
  "AUTHZ_DENIED",
  "TENANT_FORBIDDEN",
  // Org/equipe
  "SLUG_TAKEN",
  "SLUG_RESERVED",
  "LAST_OWNER",
  // Idempotência
  "IDEMPOTENCY_KEY_REQUIRED",
  "IDEMPOTENCY_KEY_REUSED",
  "IDEMPOTENCY_IN_PROGRESS",
  // Agenda
  "APPOINTMENT_CONFLICT",
  "APPOINTMENT_VERSION_CONFLICT",
  "INVALID_STATUS_TRANSITION",
  "OUTSIDE_WORKING_HOURS",
  "WITHIN_BLOCK",
  "CANCEL_TOKEN_INVALID",
  "CANCEL_TOKEN_EXPIRED",
  // Jornada
  "WORKING_HOURS_CONFLICT",
  // Profissionais
  "PROFESSIONAL_USER_TAKEN",
  "PROFESSIONAL_SERVICE_NOT_LINKED",
  // Clientes
  "PHONE_TAKEN",
  "ALREADY_ANONYMIZED",
] as const;

/** Union estável dos códigos de erro do contrato. */
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Type guard: `value` é um `ErrorCode` canônico. */
export function isErrorCode(value: unknown): value is ErrorCode {
  return (
    typeof value === "string" &&
    (ERROR_CODES as readonly string[]).includes(value)
  );
}
