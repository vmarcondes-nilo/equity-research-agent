// ============================================================================
// RATE LIMITER FOR YAHOO FINANCE API
// ============================================================================
// Implements request throttling to avoid hitting Yahoo Finance rate limits.
// Uses a token bucket algorithm with configurable delays.
//
// Default configuration:
// - 500ms minimum delay between requests
// - Batch processing support with inter-batch delays
// - Automatic retry with exponential backoff on rate limit errors
//
// Usage:
//   const limiter = new RateLimiter();
//   const result = await limiter.execute(() => fetchStockData(ticker));
//
//   // For batch processing:
//   const results = await limiter.executeBatch(tickers, fetchStockData);
// ============================================================================

export interface RateLimiterConfig {
  minDelayMs: number; // Minimum delay between requests
  maxRetries: number; // Maximum retry attempts on failure
  baseBackoffMs: number; // Base backoff time for exponential backoff
  batchSize: number; // Number of items per batch
  interBatchDelayMs: number; // Delay between batches
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  minDelayMs: 500, // 500ms between requests (2 requests/second max)
  maxRetries: 3, // Retry up to 3 times
  baseBackoffMs: 1000, // Start with 1 second backoff
  batchSize: 10, // Process 10 items per batch
  interBatchDelayMs: 2000, // 2 second delay between batches
};

export class RateLimiter {
  private config: RateLimiterConfig;
  private lastRequestTime: number = 0;
  private requestCount: number = 0;
  private errorCount: number = 0;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // CORE THROTTLING LOGIC
  // ============================================================================

  /**
   * Ensures minimum delay between requests
   */
  private async throttle(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.config.minDelayMs) {
      const waitTime = this.config.minDelayMs - timeSinceLastRequest;
      await this.sleep(waitTime);
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Calculate exponential backoff delay
   */
  private getBackoffDelay(attempt: number): number {
    return this.config.baseBackoffMs * Math.pow(2, attempt);
  }

  /**
   * Check if error is a rate limit error
   */
  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('rate limit') ||
        message.includes('too many requests') ||
        message.includes('429') ||
        message.includes('throttl')
      );
    }
    return false;
  }

  // ============================================================================
  // EXECUTION METHODS
  // ============================================================================

  /**
   * Execute a single request with rate limiting and retry logic
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        await this.throttle();
        this.requestCount++;

        const result = await fn();
        return result;
      } catch (error) {
        this.errorCount++;
        lastError = error instanceof Error ? error : new Error(String(error));

        // If rate limited, apply exponential backoff
        if (this.isRateLimitError(error) && attempt < this.config.maxRetries) {
          const backoffDelay = this.getBackoffDelay(attempt);
          console.warn(`Rate limited. Retrying in ${backoffDelay}ms (attempt ${attempt + 1}/${this.config.maxRetries})`);
          await this.sleep(backoffDelay);
          continue;
        }

        // For other errors, only retry if we have attempts left
        if (attempt < this.config.maxRetries) {
          const backoffDelay = this.getBackoffDelay(attempt);
          console.warn(`Request failed. Retrying in ${backoffDelay}ms (attempt ${attempt + 1}/${this.config.maxRetries})`);
          await this.sleep(backoffDelay);
          continue;
        }
      }
    }

    throw lastError || new Error('Request failed after all retries');
  }

  /**
   * Execute requests for multiple items with batching
   */
  async executeBatch<T, R>(
    items: T[],
    fn: (item: T) => Promise<R>,
    options: {
      onProgress?: (completed: number, total: number) => void;
      onError?: (item: T, error: Error) => void;
      continueOnError?: boolean;
    } = {}
  ): Promise<Map<T, R | Error>> {
    const results = new Map<T, R | Error>();
    const { onProgress, onError, continueOnError = true } = options;

    // Split items into batches
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += this.config.batchSize) {
      batches.push(items.slice(i, i + this.config.batchSize));
    }

    let completed = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      // Process items in batch sequentially (to respect rate limits)
      for (const item of batch) {
        try {
          const result = await this.execute(() => fn(item));
          results.set(item, result);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          results.set(item, err);

          if (onError) {
            onError(item, err);
          }

          if (!continueOnError) {
            throw err;
          }
        }

        completed++;
        if (onProgress) {
          onProgress(completed, items.length);
        }
      }

      // Add inter-batch delay (except for last batch)
      if (batchIndex < batches.length - 1) {
        await this.sleep(this.config.interBatchDelayMs);
      }
    }

    return results;
  }

  /**
   * Execute requests for multiple items and return only successful results
   */
  async executeBatchFiltered<T, R>(
    items: T[],
    fn: (item: T) => Promise<R>,
    options: {
      onProgress?: (completed: number, total: number) => void;
      onError?: (item: T, error: Error) => void;
    } = {}
  ): Promise<{ item: T; result: R }[]> {
    const allResults = await this.executeBatch(items, fn, {
      ...options,
      continueOnError: true,
    });

    const successfulResults: { item: T; result: R }[] = [];

    for (const [item, result] of allResults) {
      if (!(result instanceof Error)) {
        successfulResults.push({ item, result });
      }
    }

    return successfulResults;
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get request statistics
   */
  getStats(): {
    requestCount: number;
    errorCount: number;
    successRate: number;
  } {
    const successRate = this.requestCount > 0 ? (this.requestCount - this.errorCount) / this.requestCount : 1;

    return {
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      successRate,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.requestCount = 0;
    this.errorCount = 0;
  }

  /**
   * Estimate time for a batch of requests
   */
  estimateTime(itemCount: number): {
    estimatedSeconds: number;
    estimatedMinutes: number;
  } {
    const batches = Math.ceil(itemCount / this.config.batchSize);
    const requestTime = itemCount * this.config.minDelayMs;
    const interBatchTime = (batches - 1) * this.config.interBatchDelayMs;
    const totalMs = requestTime + interBatchTime;

    return {
      estimatedSeconds: Math.ceil(totalMs / 1000),
      estimatedMinutes: Math.ceil(totalMs / 60000),
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

// Default rate limiter instance for Yahoo Finance
export const yahooFinanceRateLimiter = new RateLimiter({
  minDelayMs: 500, // 500ms between requests
  maxRetries: 3,
  baseBackoffMs: 1000,
  batchSize: 10,
  interBatchDelayMs: 2000,
});

// Conservative rate limiter for heavy load scenarios
export const conservativeRateLimiter = new RateLimiter({
  minDelayMs: 1000, // 1 second between requests
  maxRetries: 5,
  baseBackoffMs: 2000,
  batchSize: 5,
  interBatchDelayMs: 5000,
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create a rate-limited version of any async function
 */
export function withRateLimit<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  limiter: RateLimiter = yahooFinanceRateLimiter
): (...args: T) => Promise<R> {
  return (...args: T) => limiter.execute(() => fn(...args));
}

/**
 * Process items with progress logging
 */
export async function processWithProgress<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  options: {
    label?: string;
    limiter?: RateLimiter;
  } = {}
): Promise<{ item: T; result: R }[]> {
  const { label = 'Processing', limiter = yahooFinanceRateLimiter } = options;

  console.log(`${label}: ${items.length} items`);
  const estimate = limiter.estimateTime(items.length);
  console.log(`Estimated time: ~${estimate.estimatedMinutes} minutes`);

  const results = await limiter.executeBatchFiltered(items, fn, {
    onProgress: (completed, total) => {
      const percent = Math.round((completed / total) * 100);
      process.stdout.write(`\r${label}: ${completed}/${total} (${percent}%)`);
    },
    onError: (item, error) => {
      console.warn(`\nError processing ${item}: ${error.message}`);
    },
  });

  console.log(`\n${label}: Complete. ${results.length}/${items.length} successful.`);

  return results;
}

// ============================================================================
// END OF RATE LIMITER
// ============================================================================
