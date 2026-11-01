import { bootstrapService } from '@app/common';
import { AppModule } from './app.module';

void bootstrapService(AppModule, {
  title: 'Auth Service',
  description: 'Registration, login, token issuance and refresh-token rotation.',
});
