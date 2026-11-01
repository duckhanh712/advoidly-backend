export enum IncidentType {
  ACCIDENT = 'ACCIDENT',
  TRAFFIC_JAM = 'TRAFFIC_JAM',
  FLOODING = 'FLOODING',
  ROAD_CLOSURE = 'ROAD_CLOSURE',
  CONSTRUCTION = 'CONSTRUCTION',
  OTHER = 'OTHER',
}

export enum IncidentStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  ACTIVE = 'ACTIVE',
  RESOLVED = 'RESOLVED',
  REJECTED = 'REJECTED',
}

/** Statuses visible to the public (guests and regular users). */
export const PUBLIC_INCIDENT_STATUSES: readonly IncidentStatus[] = [
  IncidentStatus.VERIFIED,
  IncidentStatus.ACTIVE,
  IncidentStatus.RESOLVED,
];
