export const MAX_SERVICE_BUFFER_AFTER_MIN = 120;

export function normalizeBufferAfterMin(
  value: number | null | undefined,
): number {
  if (value == null) return 0;
  return value;
}

export function validateBufferAfterMin(
  value: number | null | undefined,
): { valid: boolean; issue?: string } {
  if (value == null) {
    return { valid: true };
  }

  if (!Number.isInteger(value)) {
    return { valid: false, issue: "must_be_integer" };
  }

  if (value < 0) {
    return { valid: false, issue: "must_be_non_negative" };
  }

  if (value === 0) {
    return { valid: true };
  }

  if (value > MAX_SERVICE_BUFFER_AFTER_MIN) {
    return { valid: false, issue: "must_be_at_most_120" };
  }

  if (value % 5 !== 0) {
    return { valid: false, issue: "must_be_multiple_of_5" };
  }

  return { valid: true };
}

export function computeOccupiedUntil(
  endsAt: Date,
  bufferAfterMin: number | null | undefined,
): Date {
  const bufferMin = normalizeBufferAfterMin(bufferAfterMin);
  return new Date(endsAt.getTime() + bufferMin * 60 * 1000);
}
