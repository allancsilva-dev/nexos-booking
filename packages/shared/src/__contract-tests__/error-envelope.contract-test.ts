/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Contrato compile-time: `ErrorEnvelope` (API_CONTRACTS.md §2).
 *
 * Garante `code`/`message`/`requestId`/`timestamp` obrigatórios e `details` opcional.
 */
import type { ErrorEnvelope } from "../error-envelope.js";
import { assertIso8601WithOffset } from "../datetime.js";

const ts = assertIso8601WithOffset("2026-05-31T14:30:00-03:00");

/** Envelope completo, sem `details` → `details` é opcional. */
const _withoutDetails: ErrorEnvelope = {
  error: {
    code: "NOT_FOUND",
    message: "Não encontrado.",
    requestId: "01HXXSAMPLEREQUESTID",
    timestamp: ts,
  },
};

/** Envelope completo, com `details` campo a campo. */
const _withDetails: ErrorEnvelope = {
  error: {
    code: "VALIDATION_ERROR",
    message: "Dados inválidos.",
    requestId: "01HXXSAMPLEREQUESTID",
    timestamp: ts,
    details: [{ field: "startsAt", issue: "overlap" }],
  },
};

// Em cada caso inválido o literal fica na mesma linha do `@ts-expect-error`, pois a diretiva só
// suprime o erro da linha imediatamente seguinte.

// @ts-expect-error `code` é obrigatório.
const _missingCode: ErrorEnvelope = { error: { message: "x", requestId: "r", timestamp: ts } };

// @ts-expect-error `message` é obrigatório.
const _missingMessage: ErrorEnvelope = { error: { code: "NOT_FOUND", requestId: "r", timestamp: ts } };

// @ts-expect-error `requestId` é obrigatório.
const _missingRequestId: ErrorEnvelope = { error: { code: "NOT_FOUND", message: "x", timestamp: ts } };

// @ts-expect-error `timestamp` é obrigatório.
const _missingTimestamp: ErrorEnvelope = { error: { code: "NOT_FOUND", message: "x", requestId: "r" } };

// @ts-expect-error `timestamp` exige um instante com offset (string crua não basta).
const _rawTimestamp: ErrorEnvelope = { error: { code: "NOT_FOUND", message: "x", requestId: "r", timestamp: "2026-05-31T14:30:00" } };
