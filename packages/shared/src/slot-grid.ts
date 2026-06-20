/**
 * alignToSlotGrid — single anchor utility for availability + POST validation.
 * ADR-023: Grid anchor = day-start in org timezone. Reused by PR-3.3 POST validation.
 *
 * Rounds candidate to the nearest slot grid point >= anchor.
 * Grid = anchor + n * slotIntervalMin for integer n >= 0.
 *
 * @param candidate - ISO-8601 instant string
 * @param anchor - day-start instant (first working_hours.start_time joined with date in org tz)
 * @param slotIntervalMin - step between slot starts in minutes
 * @returns aligned Date (grid point >= anchor, candidate rounded up if off-grid)
 */
export function alignToSlotGrid(
  candidate: Date,
  anchor: Date,
  slotIntervalMin: number
): Date {
  const anchorMs = anchor.getTime();
  const candidateMs = candidate.getTime();
  if (candidateMs < anchorMs) return new Date(anchorMs);
  const stepMs = slotIntervalMin * 60 * 1000;
  const diffMs = candidateMs - anchorMs;
  const steps = Math.ceil(diffMs / stepMs);
  return new Date(anchorMs + steps * stepMs);
}
