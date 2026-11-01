import { isInQuietHours, vietnamHour } from './quiet-hours';

/** Builds a UTC instant for a given Vietnam (UTC+7) local hour. */
const atVietnamHour = (hour: number) => new Date(Date.UTC(2026, 9, 31, (hour - 7 + 24) % 24, 30));

describe('quiet hours (Asia/Ho_Chi_Minh)', () => {
  it('converts UTC to Vietnam local hour', () => {
    expect(vietnamHour(new Date('2026-10-31T17:30:00Z'))).toBe(0);
    expect(vietnamHour(new Date('2026-10-31T01:00:00Z'))).toBe(8);
  });

  it('handles same-day windows [start, end)', () => {
    expect(isInQuietHours(13, 15, atVietnamHour(13))).toBe(true);
    expect(isInQuietHours(13, 15, atVietnamHour(14))).toBe(true);
    expect(isInQuietHours(13, 15, atVietnamHour(15))).toBe(false);
    expect(isInQuietHours(13, 15, atVietnamHour(12))).toBe(false);
  });

  it('handles windows that wrap midnight', () => {
    expect(isInQuietHours(22, 6, atVietnamHour(23))).toBe(true);
    expect(isInQuietHours(22, 6, atVietnamHour(3))).toBe(true);
    expect(isInQuietHours(22, 6, atVietnamHour(6))).toBe(false);
    expect(isInQuietHours(22, 6, atVietnamHour(12))).toBe(false);
  });

  it('is disabled when unset or empty', () => {
    expect(isInQuietHours(null, null, atVietnamHour(3))).toBe(false);
    expect(isInQuietHours(5, 5, atVietnamHour(5))).toBe(false);
  });
});
