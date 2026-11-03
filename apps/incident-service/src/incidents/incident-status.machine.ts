import { IncidentStatus } from '@app/contracts';
import { InvalidStateTransitionException } from '@app/common';

/**
 * Allowed incident status transitions:
 *
 *   PENDING ──> VERIFIED ──> ACTIVE ──> RESOLVED
 *      │           │                       ^
 *      │           └───────────────────────┘
 *      └──────> REJECTED
 *
 * VERIFIED → RESOLVED covers incidents that end before anyone marks them ACTIVE (ADR-014).
 *
 * RESOLVED and REJECTED are terminal.
 */
export const INCIDENT_TRANSITIONS: Readonly<Record<IncidentStatus, readonly IncidentStatus[]>> = {
  [IncidentStatus.PENDING]: [IncidentStatus.VERIFIED, IncidentStatus.REJECTED],
  [IncidentStatus.VERIFIED]: [IncidentStatus.ACTIVE, IncidentStatus.RESOLVED],
  [IncidentStatus.ACTIVE]: [IncidentStatus.RESOLVED],
  [IncidentStatus.RESOLVED]: [],
  [IncidentStatus.REJECTED]: [],
};

export function canTransition(from: IncidentStatus, to: IncidentStatus): boolean {
  return INCIDENT_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: IncidentStatus, to: IncidentStatus): void {
  if (!canTransition(from, to)) throw new InvalidStateTransitionException('Incident', from, to);
}

export function isTerminal(status: IncidentStatus): boolean {
  return INCIDENT_TRANSITIONS[status].length === 0;
}
