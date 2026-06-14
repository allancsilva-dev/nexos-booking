/**
 * Helpers mínimos de ISO-8601 com offset (API_CONTRACTS.md §2 — `timestamp`).
 *
 * Objetivo único: impedir que o contrato base perca o offset. NÃO há cálculo de disponibilidade,
 * grade, DST, `alignToSlotGrid`, `SLOT_GRID_ANCHOR` nem timezone de empresa neste PR.
 *
 * O contrato exige um instante absoluto: data "solta" (sem hora) ou data-hora sem offset
 * (ex.: `2026-05-31T14:30:00`) NÃO são aceitas. O offset deve estar explícito como `Z` ou `±HH:MM`
 * (ex.: `2026-05-31T14:30:00-03:00`).
 */

/**
 * String de marca (branded) representando um instante ISO-8601 com offset explícito.
 *
 * Uma `string` comum não é atribuível a este tipo sem passar por validação, o que impede que o
 * contrato aceite silenciosamente uma string sem offset.
 */
export type Iso8601WithOffset = string & {
  readonly __brand: "Iso8601WithOffset";
};

/**
 * Data-hora com segundos e offset explícito obrigatório (`Z` ou `±HH:MM`); fração de segundo
 * opcional. Rejeita data-only e data-hora sem offset.
 */
const ISO_8601_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

/** Type guard: `value` é um instante ISO-8601 com offset explícito. */
export function isIso8601WithOffset(value: string): value is Iso8601WithOffset {
  return ISO_8601_WITH_OFFSET.test(value);
}

/**
 * Valida e marca `value` como {@link Iso8601WithOffset}. Lança `TypeError` se faltar o offset
 * (ou se for data-only), em vez de transformar silenciosamente em string sem offset.
 */
export function assertIso8601WithOffset(value: string): Iso8601WithOffset {
  if (!isIso8601WithOffset(value)) {
    throw new TypeError(
      `Expected an ISO-8601 timestamp with explicit offset (e.g. 2026-05-31T14:30:00-03:00), received: ${value}`,
    );
  }
  return value;
}
