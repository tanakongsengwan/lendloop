/** Dates are stored as ISO calendar days ("YYYY-MM-DD"), interpreted in UTC. */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isIsoDay(value: string): boolean {
  if (!ISO_DAY.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function todayIso(nowMs: number = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) /
      DAY_MS,
  );
}

/** Inclusive ranges [aStart, aEnd] and [bStart, bEnd] share at least one day. */
export function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export const MAX_LOAN_DAYS = 30;

export type RangeError =
  | "invalid_date"
  | "end_before_start"
  | "starts_in_past"
  | "too_long";

export function validateLoanRange(
  startDate: string,
  endDate: string,
  nowMs: number = Date.now(),
): RangeError | null {
  if (!isIsoDay(startDate) || !isIsoDay(endDate)) return "invalid_date";
  if (endDate < startDate) return "end_before_start";
  if (startDate < todayIso(nowMs)) return "starts_in_past";
  if (daysBetween(startDate, endDate) + 1 > MAX_LOAN_DAYS) return "too_long";
  return null;
}
