import type { ErrorCode, ErrorDetail, ErrorEnvelope, Iso8601WithOffset } from "@nexos/shared";
import { assertIso8601WithOffset } from "@nexos/shared";

export interface BuildErrorEnvelopeParams {
  code: ErrorCode;
  message: string;
  requestId: string;
  details?: ErrorDetail[];
  timestamp?: Iso8601WithOffset;
}

export function buildErrorEnvelope(params: BuildErrorEnvelopeParams): ErrorEnvelope {
  return {
    error: {
      code: params.code,
      message: params.message,
      requestId: params.requestId,
      timestamp: params.timestamp ?? (assertIso8601WithOffset(new Date().toISOString())),
      ...(params.details && params.details.length > 0 ? { details: params.details } : {}),
    },
  };
}
