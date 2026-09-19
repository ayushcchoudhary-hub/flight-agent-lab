import test from 'node:test';
import assert from 'node:assert/strict';
import { isTemporaryStatus, retryDelayMs, requestWithRetry } from '../retry.mjs';

test('retry policy recognizes only temporary HTTP statuses', () => {
  for (const status of [429, 502, 503, 504]) assert.equal(isTemporaryStatus(status), true);
  for (const status of [400, 401, 403, 404, 500]) assert.equal(isTemporaryStatus(status), false);
});

test('retry delay honors Retry-After within the configured cap', () => {
  const response = new Response('', { headers: { 'Retry-After': '10' } });
  assert.equal(retryDelayMs(response, 0, { maxMs: 2000 }), 2000);
  assert.equal(retryDelayMs(null, 1, { baseMs: 100, random: () => 0.5 }), 200);
});

test('retry runner obeys its attempt bound', async () => {
  let attempts = 0;
  const retries = [];
  const response = await requestWithRetry(async () => {
    attempts++;
    return new Response('', { status: attempts < 3 ? 503 : 200 });
  }, { maxRetries: 2, wait: async () => {}, onRetry: event => retries.push(event) });
  assert.equal(response.status, 200);
  assert.equal(attempts, 3);
  assert.equal(retries.length, 2);
});
