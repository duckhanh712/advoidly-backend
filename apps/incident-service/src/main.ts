import { bootstrapService } from '@app/common';
import { AppModule } from './app.module';

void bootstrapService(AppModule, {
  title: 'Incident Service',
  description: 'Incident reports, geospatial queries, status lifecycle and history.',
});
