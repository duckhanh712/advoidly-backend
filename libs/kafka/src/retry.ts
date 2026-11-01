export interface RetryPolicy {
  /** Retries after the first attempt (so total attempts = maxRetries + 1). */
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  initialDelayMs: 500,
  maxDelayMs: 10_000,
};

/** Exponential backoff with full jitter. */
export function backoffDelay(attempt: number, policy: RetryPolicy, random = Math.random): number {
  const ceiling = Math.min(policy.maxDelayMs, policy.initialDelayMs * 2 ** attempt);
  return Math.round(ceiling / 2 + (random() * ceiling) / 2);
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
