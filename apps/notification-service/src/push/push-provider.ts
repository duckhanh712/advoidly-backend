export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushResult {
  success: boolean;
  /** The device token is no longer valid and should be deleted. */
  invalidToken?: boolean;
  error?: string;
}

/** Adapter for a push delivery channel (FCM in production, mock locally). */
export interface PushProvider {
  readonly name: string;
  send(message: PushMessage): Promise<PushResult>;
}
