/** Vietnam has a fixed UTC+7 offset (no daylight saving time). */
const VIETNAM_UTC_OFFSET_HOURS = 7;

export function vietnamHour(now: Date): number {
  return (now.getUTCHours() + VIETNAM_UTC_OFFSET_HOURS) % 24;
}

/**
 * Whether `now` falls in the quiet window [start, end) in Vietnam local time.
 * Windows may wrap midnight (e.g. 22 → 6). `start === end` or nulls mean no quiet hours.
 */
export function isInQuietHours(
  start: number | null,
  end: number | null,
  now: Date = new Date(),
): boolean {
  if (start === null || end === null || start === end) return false;
  const hour = vietnamHour(now);
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}
