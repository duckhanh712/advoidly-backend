import { EventTypes } from './event-types';
import {
  IncidentCreatedPayload,
  IncidentRejectedPayload,
  IncidentResolvedPayload,
  IncidentUpdatedPayload,
  IncidentVerifiedPayload,
  NotificationRequestedPayload,
  UserRegisteredPayload,
  UserUpdatedPayload,
} from './payloads';

/** Maps every event type to its payload type so producers and consumers stay type-safe. */
export interface EventPayloadMap {
  [EventTypes.INCIDENT_CREATED]: IncidentCreatedPayload;
  [EventTypes.INCIDENT_VERIFIED]: IncidentVerifiedPayload;
  [EventTypes.INCIDENT_UPDATED]: IncidentUpdatedPayload;
  [EventTypes.INCIDENT_RESOLVED]: IncidentResolvedPayload;
  [EventTypes.INCIDENT_REJECTED]: IncidentRejectedPayload;
  [EventTypes.NOTIFICATION_REQUESTED]: NotificationRequestedPayload;
  [EventTypes.USER_REGISTERED]: UserRegisteredPayload;
  [EventTypes.USER_UPDATED]: UserUpdatedPayload;
}

/** Current schema version of each event. Bump on breaking payload changes. */
export const EVENT_VERSIONS: { [K in keyof EventPayloadMap]: number } = {
  [EventTypes.INCIDENT_CREATED]: 1,
  [EventTypes.INCIDENT_VERIFIED]: 1,
  [EventTypes.INCIDENT_UPDATED]: 1,
  [EventTypes.INCIDENT_RESOLVED]: 1,
  [EventTypes.INCIDENT_REJECTED]: 1,
  [EventTypes.NOTIFICATION_REQUESTED]: 1,
  [EventTypes.USER_REGISTERED]: 1,
  [EventTypes.USER_UPDATED]: 1,
};
