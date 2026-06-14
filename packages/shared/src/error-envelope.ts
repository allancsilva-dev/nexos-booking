/**
 * Envelope de erro — padrão único de corpo de falha (API_CONTRACTS.md §2).
 *
 * Toda falha (validação, autorização, conflito, rate limit, erro interno) responde com este corpo.
 * Este PR cria apenas o tipo/contrato compartilhado; o exception filter global do NestJS que produz
 * o envelope pertence a um PR posterior (PR-1.3).
 */
import type { ErrorCode } from "./error-code.js";
import type { Iso8601WithOffset } from "./datetime.js";

/**
 * Item de `details`: erro de validação campo a campo (vindo do Zod, em PR futuro).
 * Mínimo do contrato: `field` + `issue`.
 */
export interface ErrorDetail {
  field: string;
  issue: string;
}

/** Corpo do erro sob a chave `error`. */
export interface ErrorBody {
  /** Constante estável (§7); é o que o front usa para lógica e i18n. */
  code: ErrorCode;
  /** Texto curto, apresentável ao usuário final. Sem PII. */
  message: string;
  /** Mesmo `X-Request-Id` da resposta; liga o erro ao log/trace. */
  requestId: string;
  /** Instante do erro, ISO-8601 com offset. */
  timestamp: Iso8601WithOffset;
  /** Opcional: lista estruturada de erros de validação campo a campo. */
  details?: ErrorDetail[];
}

/** Envelope de erro completo (padrão único de toda resposta de falha). */
export interface ErrorEnvelope {
  error: ErrorBody;
}
