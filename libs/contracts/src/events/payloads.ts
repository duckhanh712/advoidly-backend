import { IncidentStatus, IncidentType, NotificationType, UserRole } from '../enums';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface IncidentSnapshot {
  incidentId: string;
  reporterId: string;
  type: IncidentType;
  title: string;
  description: string | null;
  status: IncidentStatus;
  location: GeoPoint;
  occurredAt: string;
}

export type IncidentCreatedPayload = IncidentSnapshot;

export interface IncidentStatusChangedPayload extends IncidentSnapshot {
  previousStatus: IncidentStatus;
  actorId: string;
  reason?: string;
}

export type IncidentVerifiedPayload = IncidentStatusChangedPayload;
export type IncidentResolvedPayload = IncidentStatusChangedPayload;
export type IncidentRejectedPayload = IncidentStatusChangedPayload & { reason: string };

export interface IncidentUpdatedPayload extends IncidentSnapshot {
  actorId: string;
  changedFields: string[];
  previousStatus?: IncidentStatus;
}

export interface NotificationRequestedPayload {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
  /** Optional key used to deduplicate notifications for the same user. */
  dedupeKey?: string;
}

export interface UserRegisteredPayload {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
}

export interface UserUpdatedPayload {
  userId: string;
  changedFields: string[];
  displayName?: string;
}
