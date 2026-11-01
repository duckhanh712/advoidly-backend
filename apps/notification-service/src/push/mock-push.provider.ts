import { Logger } from '@nestjs/common';
import { PushMessage, PushProvider, PushResult } from './push-provider';

/** Logs pushes instead of sending them. Used when FCM credentials are not configured. */
export class MockPushProvider implements PushProvider {
  readonly name = 'mock';
  private readonly logger = new Logger(MockPushProvider.name);

  async send(message: PushMessage): Promise<PushResult> {
    // TODO(temporary): console output for manual flow testing; remove once logs are shipped to files.
    console.log(
      `[mock push] → device=${message.token.slice(0, 8)}… "${message.title}" — ${message.body}`,
    );
    this.logger.log(
      { token: `${message.token.slice(0, 8)}…`, title: message.title, data: message.data },
      'Mock push delivered',
    );
    return { success: true };
  }
}
