import { Logger } from '@nestjs/common';
import { createSign } from 'node:crypto';
import { PushMessage, PushProvider, PushResult } from './push-provider';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const REQUEST_TIMEOUT_MS = 10_000;

export interface FcmCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/**
 * Firebase Cloud Messaging via the HTTP v1 API. Authenticates with a service account using
 * the OAuth 2.0 JWT-bearer flow (RS256 signed with node:crypto), so no Firebase SDK is needed.
 * Access tokens are cached until shortly before they expire.
 */
export class FcmPushProvider implements PushProvider {
  readonly name = 'fcm';
  private readonly logger = new Logger(FcmPushProvider.name);
  private accessToken?: { value: string; expiresAt: number };

  constructor(private readonly credentials: FcmCredentials) {}

  async send(message: PushMessage): Promise<PushResult> {
    try {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${this.credentials.projectId}/messages:send`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${await this.getAccessToken()}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token: message.token,
              notification: { title: message.title, body: message.body },
              data: message.data,
            },
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
      if (response.ok) return { success: true };

      const text = await response.text();
      const invalidToken = response.status === 404 || text.includes('UNREGISTERED');
      return {
        success: false,
        invalidToken,
        error: `FCM ${response.status}: ${text.slice(0, 200)}`,
      };
    } catch (error) {
      this.logger.warn(`FCM request failed: ${(error as Error).message}`);
      return { success: false, error: (error as Error).message };
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt - 60_000 > Date.now()) {
      return this.accessToken.value;
    }
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: this.signAssertion(),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`OAuth token request failed with ${response.status}`);
    const body = (await response.json()) as { access_token: string; expires_in: number };
    this.accessToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return body.access_token;
  }

  private signAssertion(): string {
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
      iss: this.credentials.clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })}`;
    const signature = createSign('RSA-SHA256')
      .update(unsigned)
      .sign(this.credentials.privateKey, 'base64url');
    return `${unsigned}.${signature}`;
  }
}
