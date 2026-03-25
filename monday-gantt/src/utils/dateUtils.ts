/** @module Date math utilities: day diffs, add days, weekend checks, date ranges */

/**
 * Parse an ISO "YYYY-MM-DD" string to a Date at midnight UTC.
 */
export function parseDate(iso: string): Date {
  const parts = iso.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Format a Date to an ISO "YYYY-MM-DD" string.
 */
export function formatDate(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${String(year)}-${month}-${day}`;
}

/**
 * Number of calendar days from date a to date b.
 * Positive if b is after a, negative if before.
 */
export function diffDays(a: string, b: string): number {
  const msA = parseDate(a).getTime();
  const msB = parseDate(b).getTime();
  return Math.round((msB - msA) / 86_400_000);
}

/**
 * Add n calendar days to an ISO date string. n can be negative.
 */
export function addDays(iso: string, n: number): string {
  const d = parseDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return formatDate(d);
}

/**
 * Returns true if the given ISO date falls on Saturday (6) or Sunday (0).
 */
export function isWeekend(iso: string): boolean {
  const day = parseDate(iso).getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Generate an inclusive array of ISO date strings from start to end.
 */
export function dateRange(start: string, end: string): string[] {
  const result: string[] = [];
  const totalDays = diffDays(start, end);
  if (totalDays < 0) return result;
  for (let i = 0; i <= totalDays; i++) {
    result.push(addDays(start, i));
  }
  return result;
}
