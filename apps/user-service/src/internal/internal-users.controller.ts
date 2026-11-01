import { Controller, Get, Param, ParseUUIDPipe, Query, VERSION_NEUTRAL } from '@nestjs/common';
import { InternalApi } from '@app/common';
import { geographyPoint, PrismaService } from '@app/database';
import { NotificationPreferencesDto } from '../preferences/preferences.dto';
import { PreferencesService } from '../preferences/preferences.service';
import { MAX_AREA_RADIUS_METERS } from '../saved-areas/saved-area.dto';
import { AlertRecipient, AlertRecipientsQueryDto } from './alert-recipients.dto';

/** Service-to-service API (internal API key). Not routed by the gateway. */
@InternalApi()
@Controller({ path: 'internal', version: VERSION_NEUTRAL })
export class InternalUsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly preferences: PreferencesService,
  ) {}

  @Get('users/:id/notification-preferences')
  getPreferences(@Param('id', ParseUUIDPipe) id: string): Promise<NotificationPreferencesDto> {
    return this.preferences.findOrDefault(id);
  }

  /**
   * Users whose saved areas contain the given point and who accept push alerts for the
   * incident type. One row per user (closest matching area).
   *
   * The constant-radius ST_DWithin is an index-assisted prefilter on the GiST index; the
   * per-row radius check cannot use the index on its own.
   */
  @Get('alert-recipients')
  findAlertRecipients(@Query() query: AlertRecipientsQueryDto): Promise<AlertRecipient[]> {
    const point = geographyPoint(query.latitude, query.longitude);
    return this.prisma.$queryRaw<AlertRecipient[]>`
      SELECT DISTINCT ON (sa.user_id)
        sa.user_id AS "userId",
        sa.id AS "savedAreaId",
        sa.name AS "savedAreaName",
        ST_Distance(sa.location, ${point}) AS "distanceMeters",
        np.quiet_hours_start AS "quietHoursStart",
        np.quiet_hours_end AS "quietHoursEnd"
      FROM users.saved_areas sa
      LEFT JOIN users.notification_preferences np ON np.user_id = sa.user_id
      WHERE ST_DWithin(sa.location, ${point}, ${MAX_AREA_RADIUS_METERS})
        AND ST_DWithin(sa.location, ${point}, sa.radius_meters)
        AND COALESCE(np.push_enabled, TRUE)
        AND (np.incident_types IS NULL
             OR cardinality(np.incident_types) = 0
             OR ${query.incidentType} = ANY(np.incident_types))
      ORDER BY sa.user_id, ST_Distance(sa.location, ${point})
    `;
  }
}
