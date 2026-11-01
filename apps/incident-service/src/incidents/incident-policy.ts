import { HttpStatus } from '@nestjs/common';
import { AppException, ErrorCodes } from '@app/common';
import {
  AuthenticatedUser,
  IncidentStatus,
  MODERATION_ROLES,
  PUBLIC_INCIDENT_STATUSES,
} from '@app/contracts';
import { MAX_BBOX_SPAN_DEGREES } from './dto/query-incidents.dto';
import type { BoundingBox } from './incidents.repository';

export const MAX_OCCURRED_AT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_OCCURRED_AT_SKEW_MS = 5 * 60 * 1000;

export const isModerator = (user?: AuthenticatedUser): boolean =>
  !!user && MODERATION_ROLES.includes(user.role);

/** Whether `user` (possibly a guest) may see an incident with this status/reporter. */
export function canView(
  incident: { status: IncidentStatus; reporterId: string },
  user?: AuthenticatedUser,
): boolean {
  return (
    PUBLIC_INCIDENT_STATUSES.includes(incident.status) ||
    isModerator(user) ||
    incident.reporterId === user?.id
  );
}

/**
 * Statuses a caller may list. Guests and users only see public statuses, except for their
 * own reports (`mine`). Moderators may request any status.
 */
export function resolveListStatuses(
  requested: IncidentStatus[] | undefined,
  user: AuthenticatedUser | undefined,
  mine: boolean,
): IncidentStatus[] {
  const allowed =
    mine || isModerator(user) ? Object.values(IncidentStatus) : [...PUBLIC_INCIDENT_STATUSES];
  if (!requested?.length) return allowed;
  const forbidden = requested.filter((s) => !allowed.includes(s));
  if (forbidden.length > 0) {
    throw new AppException(
      ErrorCodes.FORBIDDEN,
      `Not allowed to list incidents with status: ${forbidden.join(', ')}`,
      HttpStatus.FORBIDDEN,
    );
  }
  return requested;
}

export function assertBoundingBox(bbox: BoundingBox): void {
  if (
    bbox.maxLat - bbox.minLat > MAX_BBOX_SPAN_DEGREES ||
    bbox.maxLng - bbox.minLng > MAX_BBOX_SPAN_DEGREES
  ) {
    throw new AppException(
      ErrorCodes.VALIDATION_FAILED,
      `Bounding box sides must not exceed ${MAX_BBOX_SPAN_DEGREES} degrees`,
      HttpStatus.BAD_REQUEST,
    );
  }
}

/** Rejects timestamps in the future (beyond clock skew) or older than 7 days. */
export function assertOccurredAt(occurredAt: Date, now: Date = new Date()): void {
  const delta = now.getTime() - occurredAt.getTime();
  if (delta < -MAX_OCCURRED_AT_SKEW_MS || delta > MAX_OCCURRED_AT_AGE_MS) {
    throw new AppException(
      ErrorCodes.VALIDATION_FAILED,
      'occurredAt must not be in the future or older than 7 days',
      HttpStatus.BAD_REQUEST,
      [{ field: 'occurredAt', errors: ['out of accepted range'] }],
    );
  }
}
