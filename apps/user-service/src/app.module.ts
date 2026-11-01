import { Module } from '@nestjs/common';
import { SecurityModule } from '@app/common';
import { AppConfigModule } from '@app/config';
import { DatabaseModule, PrismaHealthIndicator } from '@app/database';
import { KafkaModule } from '@app/kafka';
import { HealthModule, ObservabilityModule } from '@app/observability';
import { UserEventsHandler } from './events/user-events.handler';
import { InternalUsersController } from './internal/internal-users.controller';
import { PreferencesController } from './preferences/preferences.controller';
import { PreferencesService } from './preferences/preferences.service';
import { ProfilesController } from './profiles/profiles.controller';
import { ProfilesService } from './profiles/profiles.service';
import { SavedAreasController } from './saved-areas/saved-areas.controller';
import { SavedAreasService } from './saved-areas/saved-areas.service';

@Module({
  imports: [
    AppConfigModule.forService('user-service'),
    ObservabilityModule,
    SecurityModule,
    DatabaseModule,
    KafkaModule,
    HealthModule.forRoot([PrismaHealthIndicator]),
  ],
  controllers: [
    ProfilesController,
    SavedAreasController,
    PreferencesController,
    InternalUsersController,
  ],
  providers: [ProfilesService, SavedAreasService, PreferencesService, UserEventsHandler],
})
export class AppModule {}
