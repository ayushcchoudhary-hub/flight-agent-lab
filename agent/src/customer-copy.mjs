export const SAFE_REDIRECT = 'I can help with flight searches. Tell me where you would like to fly, or share the trip detail you want to change.';
export const SAFE_FAILURE = "I couldn't complete that request. Please try again. If it continues, contact CommonSwyft support.";
export const SAFE_SEARCH_FAILURE = "I couldn't check flights right now. Please try again.";

const checks = [
  ['profanity or insult', /\b(?:fuck\w*|shit\w*|damn|asshole|bitch\w*|idiot|stupid|useless|moron)\b/i],
  ['threatening language', /\b(?:i|we)(?:'ll|\s+will|\s+am going to|\s+are going to)\s+(?:hurt|harm|kill|attack|punish)\b/i],
  ['sexualized language', /\b(?:send nudes|sexual favors?|have sex with|turn me on)\b/i],
  ['claimed consequential action', /\b(?:I(?:'ve| have)?|we(?:'ve| have)?)\s+(?:successfully\s+)?(?:booked|purchased|charged|cancelled|refunded)\b/i],
  ['credential or payment secret', /\b(?:Bearer\s+[A-Za-z0-9._-]{8,}|sk-[A-Za-z0-9_-]{8,}|(?:api|secret)[_-]?key\s*[:=]|(?:\d[ -]*?){13,19})\b/i],
  ['internal implementation detail', /\b(?:local copy|policy snapshot|repository|retrieval|rag|tool call|system prompt|implementation detail|model prompt|backend log)\b/i],
];

export function normalizeCustomerCopy(value) {
  return String(value ?? '').trim().replace(/\s*—\s*/g, '. ').replace(/;/g, '.');
}

export function reviewCustomerCopy(value) {
  const text = normalizeCustomerCopy(value);
  if (!text) return { ok: false, reason: 'empty output', text };
  const failed = checks.find(([, pattern]) => pattern.test(text));
  return failed ? { ok: false, reason: failed[0], text } : { ok: true, text };
}

export function safeCustomerCopy(value, fallback) {
  const review = reviewCustomerCopy(value);
  return review.ok ? review.text : fallback;
}

// Operational errors belong in the trace. Only explicitly allowlisted validation
// guidance may reach a traveler, so provider names and implementation details
// cannot leak through an unexpected exception.
const customerActionableErrors = [
  /^Please (?:enter|choose|supply|narrow|give|select)\b/i,
  /^The (?:end date|departure date|date range)\b/i,
  /^Departure and destination overlap\b/i,
  /^Budget must\b/i,
];

export function safeSearchError(error) {
  const text = normalizeCustomerCopy(error instanceof Error ? error.message : '');
  return customerActionableErrors.some(pattern => pattern.test(text))
    ? safeCustomerCopy(text, SAFE_SEARCH_FAILURE)
    : SAFE_SEARCH_FAILURE;
}
