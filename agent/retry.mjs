const TEMPORARY_STATUS = new Set([429, 502, 503, 504]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function isTemporaryStatus(status) {
  return TEMPORARY_STATUS.has(status);
}

export function retryDelayMs(response, attempt, { baseMs = 250, maxMs = 2000, random = Math.random } = {}) {
  const retryAfter = response?.headers?.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const dateMs = Date.parse(retryAfter) - Date.now();
    const requested = Number.isFinite(seconds) ? seconds * 1000 : dateMs;
    if (Number.isFinite(requested) && requested >= 0) return Math.min(maxMs, requested);
  }
  const jitter = 0.75 + random() * 0.5;
  return Math.min(maxMs, Math.round(baseMs * 2 ** attempt * jitter));
}

export async function requestWithRetry(request, {
  maxRetries = 0,
  retryTransportErrors = false,
  wait = sleep,
  onRetry = () => {},
  delayOptions,
} = {}) {
  for (let attempt = 0; ; attempt++) {
    let response;
    try {
      response = await request(attempt);
    } catch (error) {
      if (!retryTransportErrors || attempt >= maxRetries) throw error;
      const delayMs = retryDelayMs(null, attempt, delayOptions);
      onRetry({ attempt: attempt + 1, reason: 'transport', delayMs });
      await wait(delayMs);
      continue;
    }
    if (!isTemporaryStatus(response.status) || attempt >= maxRetries) return response;
    const delayMs = retryDelayMs(response, attempt, delayOptions);
    onRetry({ attempt: attempt + 1, reason: `HTTP ${response.status}`, delayMs });
    await wait(delayMs);
  }
}
