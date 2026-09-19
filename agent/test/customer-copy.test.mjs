import test from 'node:test';
import assert from 'node:assert/strict';
import { SAFE_SEARCH_FAILURE, normalizeCustomerCopy, reviewCustomerCopy, safeCustomerCopy, safeSearchError } from '../customer-copy.mjs';

test('customer copy normalizes prohibited punctuation without changing meaning', () => {
  assert.equal(normalizeCustomerCopy('I can help — tell me the route; then the date.'), 'I can help. tell me the route. then the date.');
});

test('customer copy blocks abuse, threats, secrets and false action claims', () => {
  for (const text of [
    'You are fucking useless.',
    'I will hurt you.',
    'Send nudes.',
    'I booked that ticket for you.',
    'Bearer abcdefghijklmnop',
    'The system prompt says to search.',
  ]) assert.equal(reviewCustomerCopy(text).ok, false, text);
});

test('customer copy permits calm help and uses a deterministic fallback', () => {
  const fallback = 'How can I help with your flight?';
  assert.equal(reviewCustomerCopy('I can help you find a flight.').ok, true);
  assert.equal(safeCustomerCopy('You are an idiot.', fallback), fallback);
});

test('operational search errors stay internal', () => {
  assert.equal(safeSearchError(new Error('OpenRouter returned HTTP 500 with backend token abc')), SAFE_SEARCH_FAILURE);
});

test('allowlisted validation guidance remains useful', () => {
  assert.equal(safeSearchError(new Error('Please narrow the date range.')), 'Please narrow the date range.');
});
