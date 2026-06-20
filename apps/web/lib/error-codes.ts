import type { ErrorCode } from "@nexos/shared";

// Typed constants for error codes used in the frontend.
// These reference the ErrorCode union from @nexos/shared — never redeclared.
// Hardcoded strings are prohibited by R6.
export const UNAUTHENTICATED: ErrorCode = "UNAUTHENTICATED";
export const INTERNAL_ERROR: ErrorCode = "INTERNAL_ERROR";
export const EMAIL_TAKEN: ErrorCode = "EMAIL_TAKEN";
