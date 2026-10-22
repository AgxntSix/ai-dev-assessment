import { LlmError, TimeoutError } from "./errors.ts";

export type RetryOptions = Readonly<{
  attempts: number;
  baseDelayMs?: number;
  onRetry?: (attempt: number, err: unknown) => void;
}>;

export function isTransient(err: unknown): boolean {
  if (err instanceof TimeoutError) return true;
  if (err instanceof LlmError) return err.status === undefined || err.status === 429 || err.status >= 500;
  return false;
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const baseDelayMs = options.baseDelayMs ?? 200;
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isTransient(err) || attempt === options.attempts) break;
      options.onRetry?.(attempt, err);
      await Bun.sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}
