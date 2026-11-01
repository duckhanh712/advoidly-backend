import { bootstrapService } from '@app/common';
import { AppModule } from './app.module';

void bootstrapService(AppModule, {
  title: 'User Service',
  description: 'User profiles, saved areas and notification preferences.',
});
