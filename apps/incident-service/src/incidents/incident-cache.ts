/** Redis key for a cached incident detail (`GET /incidents/{id}`). */
export const incidentCacheKey = (incidentId: string): string => `incident:${incidentId}`;
