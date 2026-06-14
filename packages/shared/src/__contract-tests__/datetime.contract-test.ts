/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Contrato compile-time: helpers ISO-8601 com offset (API_CONTRACTS.md §2).
 *
 * O tipo de marca impede que uma string sem offset seja aceita silenciosamente como instante.
 */
import {
  assertIso8601WithOffset,
  isIso8601WithOffset,
  type Iso8601WithOffset,
} from "../datetime.js";
import type { Equal, Expect } from "./type-utils.js";

/** A validação produz um valor de marca, não uma `string` crua. */
type _AssertBrandReturn = Expect<
  Equal<ReturnType<typeof assertIso8601WithOffset>, Iso8601WithOffset>
>;

/** O valor de marca continua sendo uma `string` em runtime (atribuível a `string`). */
const _brandIsString: string = assertIso8601WithOffset(
  "2026-05-31T14:30:00-03:00",
);

// @ts-expect-error string crua sem validação não é um `Iso8601WithOffset`.
const _rawNotBranded: Iso8601WithOffset = "2026-05-31T14:30:00-03:00";

// @ts-expect-error data-only não é um instante com offset.
const _dateOnlyNotBranded: Iso8601WithOffset = "2026-05-31";

/** O type guard estreita `string` para `Iso8601WithOffset`. */
function _narrows(value: string): Iso8601WithOffset | null {
  if (isIso8601WithOffset(value)) {
    const narrowed: Iso8601WithOffset = value;
    return narrowed;
  }
  return null;
}
