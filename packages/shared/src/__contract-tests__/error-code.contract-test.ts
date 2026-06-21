/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Contrato compile-time: `ErrorCode` (API_CONTRACTS.md §7 + §22).
 *
 * Quebra o build se a união divergir dos 36 códigos canônicos, se `CONSENT_REQUIRED` virar código
 * ou se `RATE_LIMITED` deixar de ser código.
 */
import { ERROR_CODES, type ErrorCode } from "../error-code.js";
import type { Equal, Expect } from "./type-utils.js";

/** União esperada — exatamente os 36 códigos do contrato. */
type ExpectedErrorCode =
  // Genéricos
  | "VALIDATION_ERROR"
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "INTERNAL_ERROR"
  | "RATE_LIMITED"
  // Auth
  | "UNAUTHENTICATED"
  | "INVALID_CREDENTIALS"
  | "TOKEN_EXPIRED"
  | "REFRESH_REUSED"
  | "EMAIL_NOT_VERIFIED"
  | "VERIFICATION_TOKEN_INVALID"
  | "VERIFICATION_TOKEN_EXPIRED"
  | "EMAIL_TAKEN"
  | "NO_ACTIVE_ORG"
  // Convite
  | "INVITE_TOKEN_INVALID"
  | "INVITE_TOKEN_EXPIRED"
  | "ALREADY_MEMBER"
  // Authorization
  | "AUTHZ_DENIED"
  | "TENANT_FORBIDDEN"
  // Org/equipe
  | "SLUG_TAKEN"
  | "SLUG_RESERVED"
  | "LAST_OWNER"
  // Idempotência
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "IDEMPOTENCY_KEY_REUSED"
  | "IDEMPOTENCY_IN_PROGRESS"
  // Agenda
  | "APPOINTMENT_CONFLICT"
  | "APPOINTMENT_VERSION_CONFLICT"
  | "INVALID_STATUS_TRANSITION"
  | "OUTSIDE_WORKING_HOURS"
  | "WITHIN_BLOCK"
  | "CANCEL_TOKEN_INVALID"
  | "CANCEL_TOKEN_EXPIRED"
  // Jornada
  | "WORKING_HOURS_CONFLICT"
  // Profissionais
  | "PROFESSIONAL_USER_TAKEN"
  // Clientes
  | "PHONE_TAKEN"
  | "ALREADY_ANONYMIZED";

/** A união materializada equivale exatamente à esperada (nem mais, nem menos). */
type _AssertUnionExact = Expect<Equal<ErrorCode, ExpectedErrorCode>>;

/** A constante materializa exatamente 36 códigos (tupla `as const`). */
type _AssertCount = Expect<Equal<(typeof ERROR_CODES)["length"], 36>>;

/** `RATE_LIMITED` É um código aceito. */
const _rateLimitedIsCode: ErrorCode = "RATE_LIMITED";

/** Cada código também é representável (sanidade de membros). */
const _validation: ErrorCode = "VALIDATION_ERROR";
const _appointmentConflict: ErrorCode = "APPOINTMENT_CONFLICT";

// @ts-expect-error `CONSENT_REQUIRED` NÃO é um ErrorCode (§22: vira `details` de VALIDATION_ERROR).
const _consentNotCode: ErrorCode = "CONSENT_REQUIRED";

// @ts-expect-error string arbitrária não é um ErrorCode.
const _arbitraryNotCode: ErrorCode = "NOT_A_REAL_CODE";
