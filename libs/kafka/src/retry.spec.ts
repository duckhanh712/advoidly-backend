import { backoffDelay } from './retry';

describe('backoffDelay', () => {
  const policy = { maxRetries: 5, initialDelayMs: 100, maxDelayMs: 1000 };

  it('grows exponentially within jitter bounds', () => {
    expect(backoffDelay(0, policy, () => 0)).toBe(50);
    expect(backoffDelay(0, policy, () => 1)).toBe(100);
    expect(backoffDelay(2, policy, () => 0)).toBe(200);
    expect(backoffDelay(2, policy, () => 1)).toBe(400);
  });

  it('is capped by maxDelayMs', () => {
    expect(backoffDelay(10, policy, () => 1)).toBe(1000);
  });
});
