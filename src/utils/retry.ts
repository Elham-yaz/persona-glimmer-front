interface RetryOptions {
  maxRetries?: number;
  delay?: number;
  backoff?: boolean;
  retryable?: (error: unknown) => boolean;
}

function defaultRetryable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // Network errors / fetch failures
  if (error.name === 'TypeError' && /fetch/i.test(error.message)) {
    return true;
  }
  // Timeouts
  if (error.name === 'AbortError') {
    return true;
  }
  // Gateway / server errors surfaced as messages
  if (/\b(500|502|503|504)\b/.test(error.message)) {
    return true;
  }
  // CORS errors might indicate the backend is down
  if (/CORS/.test(error.message)) {
    return true;
  }
  return false;
}

export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { maxRetries = 3, delay = 1000, backoff = true, retryable = defaultRetryable } = options;

  let lastError: unknown;
  let currentDelay = delay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;

      // Don't retry if it's the last attempt or the error is not retryable
      if (attempt === maxRetries || !retryable(error)) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, backoff ? currentDelay : delay));
      if (backoff) currentDelay *= 2; // Exponential backoff
    }
  }

  throw lastError;
}
