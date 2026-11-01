import { bootstrapService } from '@app/common';
import { AppModule } from './app.module';

void bootstrapService(AppModule, {
  title: 'Moderation Service',
  description: 'Review queue for incident reports: approve, reject, request info, duplicate hints.',
});
