import { AppException } from '@app/common';
import { AuthenticatedUser, IncidentStatus, UserRole } from '@app/contracts';
import {
  assertBoundingBox,
  assertOccurredAt,
  canView,
  resolveListStatuses,
} from './incident-policy';

const user: AuthenticatedUser = { id: 'u1', email: 'u@example.com', role: UserRole.USER };
const moderator: AuthenticatedUser = { id: 'm1', email: 'm@example.com', role: UserRole.MODERATOR };

describe('incident access policy', () => {
  it('hides pending incidents from guests and other users, but not from the reporter or moderators', () => {
    const pending = { status: IncidentStatus.PENDING, reporterId: 'u1' };
    expect(canView(pending)).toBe(false);
    expect(canView(pending, { ...user, id: 'u2' })).toBe(false);
    expect(canView(pending, user)).toBe(true);
    expect(canView(pending, moderator)).toBe(true);
    expect(canView({ status: IncidentStatus.ACTIVE, reporterId: 'x' })).toBe(true);
  });

  it('limits guests to public statuses and rejects explicit requests for hidden ones', () => {
    expect(resolveListStatuses(undefined, undefined, false).sort()).toEqual([
      'ACTIVE',
      'RESOLVED',
      'VERIFIED',
    ]);
    expect(() => resolveListStatuses([IncidentStatus.PENDING], user, false)).toThrow(AppException);
  });

  it('lets reporters list their own pending reports and moderators list anything', () => {
    expect(resolveListStatuses([IncidentStatus.PENDING], user, true)).toEqual(['PENDING']);
    expect(resolveListStatuses([IncidentStatus.REJECTED], moderator, false)).toEqual(['REJECTED']);
  });
});

describe('geospatial and time guards', () => {
  it('rejects bounding boxes wider than 5 degrees', () => {
    expect(() =>
      assertBoundingBox({ minLat: 10, minLng: 105, maxLat: 11, maxLng: 106 }),
    ).not.toThrow();
    expect(() => assertBoundingBox({ minLat: 8, minLng: 102, maxLat: 23, maxLng: 110 })).toThrow(
      AppException,
    );
  });

  it('accepts recent timestamps and small clock skew, rejects future and stale ones', () => {
    const now = new Date('2026-10-31T12:00:00Z');
    expect(() => assertOccurredAt(new Date('2026-10-31T11:00:00Z'), now)).not.toThrow();
    expect(() => assertOccurredAt(new Date('2026-10-31T12:04:00Z'), now)).not.toThrow();
    expect(() => assertOccurredAt(new Date('2026-10-31T12:10:00Z'), now)).toThrow(AppException);
    expect(() => assertOccurredAt(new Date('2026-10-20T12:00:00Z'), now)).toThrow(AppException);
  });
});
