export class HttpError extends Error {
  constructor(
    readonly status: number,
    url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}

interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 4xx (except 429) is our bug or a missing record: retrying won't help.
const isRetryable = (e: unknown) => !(e instanceof HttpError) || e.status === 429 || e.status >= 500;

/** GET JSON with a per-attempt timeout and exponential backoff + jitter. */
export async function fetchJson(
  url: string,
  { retries = 3, baseDelayMs = 500, timeoutMs = 15_000 }: RetryOptions = {},
): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/vnd.api+json' } });
      if (!res.ok) throw new HttpError(res.status, url);
      return (await res.json()) as unknown;
    } catch (e) {
      if (attempt >= retries || !isRetryable(e)) throw e;
      await sleep(baseDelayMs * 2 ** attempt * (0.5 + Math.random()));
    } finally {
      clearTimeout(timer);
    }
  }
}
