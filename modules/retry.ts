import { createLogger } from './logger.js';

const logger = createLogger('retry');

export interface RetryOptions {
  maxRetries?: number;
  backoffMs?: number[];
  label?: string;
}

const DEFAULT_BACKOFF = [500, 2000, 8000];

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 3;
  const backoff = opts.backoffMs ?? DEFAULT_BACKOFF;
  const label = opts.label ?? 'operation';

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const delay = backoff[attempt] ?? backoff[backoff.length - 1]!;
        logger.warn(`${label} attempt ${attempt + 1} failed, retrying in ${delay}ms: ${lastError.message}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  logger.error(`${label} failed after ${maxRetries + 1} attempts`, lastError);
  throw lastError;
}
