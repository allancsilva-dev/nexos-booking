"use client";

import type { ErrorDetail } from "@nexos/shared";
import type { UseFormSetError, FieldValues, Path } from "react-hook-form";
import type { ApiError } from "./http-client";

/**
 * Extrai erros de campo do array `details` do envelope de erro.
 *
 * Retorna um mapa plano `{ "email": "Formato inválido", ... }`.
 * Agnóstico a status HTTP (usa `details[]`, não 400/422).
 */
export function extractFieldErrors(
  err: ApiError,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const d of err.details ?? []) {
    if (d.field && d.issue) {
      map[d.field] = d.issue;
    }
  }
  return map;
}

/**
 * Aplica erros de campo do `ApiError` no formulário react-hook-form.
 *
 * - Aplica `setError(field, { message: issue })` apenas para campos que
 *   existem em `knownFieldNames`.
 * - Campos desconhecidos (retornados pelo backend mas ausentes no formulário)
 *   são coletados e retornados para o caller exibir fallback (toast).
 * - Agnóstico a status HTTP: inspeciona `details[]`, não `err.status`.
 *
 * @returns `{ applied, unknownFields }` — se `applied === 0 && unknownFields.length === 0`,
 *   o erro não tem `details` e deve ser tratado como erro global.
 */
export function applyFormFieldErrors<T extends FieldValues>(
  err: ApiError,
  setError: UseFormSetError<T>,
  knownFieldNames: ReadonlyArray<string>,
): { applied: number; unknownFields: ErrorDetail[] } {
  const details = err.details ?? [];
  const knownSet = new Set(knownFieldNames);
  const unknownFields: ErrorDetail[] = [];
  let applied = 0;

  for (const d of details) {
    if (knownSet.has(d.field)) {
      setError(d.field as Path<T>, { message: d.issue });
      applied++;
    } else {
      unknownFields.push(d);
    }
  }

  return { applied, unknownFields };
}

/**
 * Retorna payload para exibição de erro global (toast / ErrorDisplay).
 *
 * Usar quando `details` está vazio ou como fallback após `applyFormFieldErrors`.
 */
export function formatGlobalError(err: ApiError): {
  code: string;
  message: string;
  requestId?: string;
} {
  return {
    code: err.code,
    message: err.message,
    requestId: err.requestId,
  };
}
