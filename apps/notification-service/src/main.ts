import { bootstrapService } from '@app/common';
import { AppModule } from './app.module';

void bootstrapService(AppModule, {
  title: 'Notification Service',
  description: 'In-app notifications and push delivery driven by Kafka events.',
});
