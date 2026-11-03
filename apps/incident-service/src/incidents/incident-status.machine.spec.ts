import { InvalidStateTransitionException } from '@app/common';
import { IncidentStatus } from '@app/contracts';
import {
  assertTransition,
  canTransition,
  INCIDENT_TRANSITIONS,
  isTerminal,
} from './incident-status.machine';

const { PENDING, VERIFIED, ACTIVE, RESOLVED, REJECTED } = IncidentStatus;
const ALL = Object.values(IncidentStatus);

describe('incident status machine', () => {
  const allowed: [IncidentStatus, IncidentStatus][] = [
    [PENDING, VERIFIED],
    [PENDING, REJECTED],
    [VERIFIED, ACTIVE],
    [VERIFIED, RESOLVED],
    [ACTIVE, RESOLVED],
  ];

  it.each(allowed)('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  const forbidden = ALL.flatMap((from) =>
    ALL.map((to) => [from, to] as [IncidentStatus, IncidentStatus]),
  ).filter(([from, to]) => !allowed.some(([a, b]) => a === from && b === to));

  it.each(forbidden)('forbids %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow(InvalidStateTransitionException);
  });

  it('covers every status and has exactly the documented transitions', () => {
    expect(Object.keys(INCIDENT_TRANSITIONS).sort()).toEqual([...ALL].sort());
    expect(forbidden).toHaveLength(ALL.length * ALL.length - allowed.length);
  });

  it('treats RESOLVED and REJECTED as terminal', () => {
    expect(ALL.filter(isTerminal).sort()).toEqual([REJECTED, RESOLVED]);
  });

  it('reports the current and requested status on violation', () => {
    try {
      assertTransition(RESOLVED, ACTIVE);
      fail('expected an exception');
    } catch (error) {
      expect((error as InvalidStateTransitionException).details).toEqual({
        from: RESOLVED,
        to: ACTIVE,
      });
      expect((error as InvalidStateTransitionException).getStatus()).toBe(409);
    }
  });
});
