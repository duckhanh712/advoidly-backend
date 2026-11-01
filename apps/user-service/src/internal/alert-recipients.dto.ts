import { Type } from 'class-transformer';
import { IsEnum, IsLatitude, IsLongitude } from 'class-validator';
import { IncidentType } from '@app/contracts';

export class AlertRecipientsQueryDto {
  @Type(() => Number)
  @IsLatitude()
  latitude: number;

  @Type(() => Number)
  @IsLongitude()
  longitude: number;

  @IsEnum(IncidentType)
  incidentType: IncidentType;
}

export interface AlertRecipient {
  userId: string;
  savedAreaId: string;
  savedAreaName: string;
  distanceMeters: number;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
}
