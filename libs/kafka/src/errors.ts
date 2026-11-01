/**
 * Throw from an event handler when retrying cannot succeed (e.g. the payload references
 * data that does not exist). The message is sent to the dead-letter topic immediately.
 */
export class NonRetryableEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableEventError';
  }
}
