import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, /key|token|authorization|password|secret/i.test(k) && !/tokens|cache/i.test(k) ? '[REDACTED]' : redact(v)]));
  if (typeof value === 'string') return value
    .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED_KEY]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[EMAIL]')
    .replace(/(?:\d[ -]?){13,19}/g, '[LONG_NUMBER]');
  return value;
}
export function fileTrace(directory, sessionId) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `${sessionId}.jsonl`);
  return { path, emit(type, data) { appendFileSync(path, JSON.stringify({ at: new Date().toISOString(), type, data: redact(data) }) + '\n', { mode: 0o600 }); } };
}
