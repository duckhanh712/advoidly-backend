import { IncidentReportStatus, Prisma } from '@prisma/client';

/**
 * A confirmation is an accepted report on an incident by someone other than its original
 * reporter. Used for both `GET /incidents/{id}/reports` and `confirmationCount`, so the list
 * total and the count always agree.
 */
export function confirmationsWhere(
  incidentId: string,
  originalReporterId: string,
): Prisma.IncidentReportWhereInput {
  return {
    incidentId,
    status: IncidentReportStatus.ACCEPTED,
    reporterId: { not: originalReporterId },
  };
}
