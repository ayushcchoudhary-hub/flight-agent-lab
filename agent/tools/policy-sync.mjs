// Keeps policy-snapshot.json in step with the live privacy and terms pages.
//
// The agent answers policy questions from a reviewed snapshot, not from the
// live page, so answers stay reproducible and nothing unreviewed reaches a
// traveler. This checks that the snapshot is still what the site shows.
//
//   node policy-sync.mjs            check; exit 0 current, 1 changed, 2 unknown
//   node policy-sync.mjs --write    rewrite the snapshot from the live pages
//   node policy-sync.mjs --base https://commonswyft.com   check another host
//
// The site is a single-page app. /privacy returns an empty HTML shell and the
// wording lives in the JavaScript bundle, so this follows shell, entry script
// and main bundle, then reads the paragraphs of the two page components. If
// the site's structure changes and the text cannot be found, the result is
// unknown, never "unchanged".
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { POLICY_SNAPSHOT } from '../paths.mjs';

const SNAPSHOT = POLICY_SNAPSHOT;
const PAGES = [{ key: 'privacy', path: '/privacy', title: 'Privacy Policy' }, { key: 'terms', path: '/terms', title: 'Terms & Conditions' }];
const MAX_BYTES = 10_000_000;

// Compare what a reader sees: spacing, quote style and a space before
// punctuation (a link followed by ".") do not count as a policy change.
export const normalizePolicyText = value => String(value ?? '')
  .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
  .replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();

// Read one template literal starting at s[i] === '`'. Returns [text, end].
function literal(s, i) {
  const end = s.indexOf('`', i + 1);
  if (end < 0) throw new Error('Unterminated string in the policy bundle.');
  const text = s.slice(i + 1, end);
  if (text.includes('${')) throw new Error('A policy paragraph uses a computed value this check cannot read.');
  return [text, end + 1];
}

// Index just past the bracket or brace that closes the one at s[i].
function closing(s, i) {
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const stack = [];
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '`') { j = literal(s, j)[1] - 1; continue; }
    if (pairs[c]) stack.push(pairs[c]);
    else if (c === stack.at(-1)) { stack.pop(); if (!stack.length) return j + 1; }
  }
  throw new Error('Unbalanced markup in the policy bundle.');
}

// The text a `children:` value renders: a string, a variable holding one,
// or a list of those and nested elements.
function childrenText(s, i, bundle) {
  if (s[i] === '`') return literal(s, i)[0];
  if (s[i] === '[') {
    const inner = s.slice(i + 1, closing(s, i) - 1), parts = [];
    for (let j = 0; j < inner.length;) {
      if (inner[j] === '`') { const [text, end] = literal(inner, j); parts.push(text); j = end; }
      else if (inner[j] === '(') { const end = closing(inner, j), call = inner.slice(j, closing(inner, end)); parts.push(elementText(call, bundle)); j = closing(inner, end); }
      else j++;
    }
    return parts.join('');
  }
  const name = /^[A-Za-z_$][\w$]*/.exec(s.slice(i))?.[0];
  const value = name && new RegExp(`[,;{(\\s]${name.replace(/\$/g, '\\$')}=\`([^\`$]*)\``).exec(bundle);
  if (!value) throw new Error('A policy paragraph uses a value this check cannot read.');
  return value[1];
}

// Where the value of an object's own children key starts, ignoring any
// children key nested inside it. -1 when there is none.
function childrenAt(props) {
  const pairs = { '(': ')', '[': ']', '{': '}' }, stack = [];
  for (let j = 0; j < props.length; j++) {
    const c = props[j];
    if (c === '`') { j = literal(props, j)[1] - 1; continue; }
    if (pairs[c]) stack.push(pairs[c]);
    else if (c === stack.at(-1)) stack.pop();
    else if (stack.length === 1 && props.startsWith('children:', j) && /[{,]/.test(props[j - 1])) return j + 'children:'.length;
  }
  return -1;
}

// A rendered element such as (0,G.jsx)(`a`,{...,children:x}).
function elementText(call, bundle) {
  const open = call.indexOf('{');
  if (open < 0) return '';
  const props = call.slice(open, closing(call, open)), at = childrenAt(props);
  return at < 0 ? '' : childrenText(props, at, bundle);
}

// The paragraphs of one page component, in order, with the heading above each.
export function extractPolicyPage(bundle, title) {
  const h1 = new RegExp('\\(`h1`,\\{[^{}]*children:`' + title.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&') + '`\\}\\)').exec(bundle);
  if (!h1) throw new Error(`The ${title} page was not found in the site bundle.`);
  const start = h1.index + h1[0].length, end = bundle.indexOf('}function ', start);
  const body = bundle.slice(start, end < 0 ? undefined : end);
  const paragraphs = []; let heading = null;
  for (const match of body.matchAll(/\(`(p|h2)`,\{/g)) {
    const open = match.index + match[0].length - 1, props = body.slice(open, closing(body, open));
    const at = childrenAt(props);
    if (at < 0) continue;
    const text = normalizePolicyText(childrenText(props, at, bundle));
    if (match[1] === 'h2') heading = text;
    else if (text) paragraphs.push({ heading, text });
  }
  if (!paragraphs.length) throw new Error(`No paragraphs were found on the ${title} page.`);
  return paragraphs;
}

async function fetchText(url, fetchImpl) {
  const response = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new Error(`${url} is larger than expected.`);
  return text;
}

// Only CommonSwyft's own site, over https, and only scripts it serves itself.
export async function fetchLivePolicy(base, fetchImpl = fetch) {
  const origin = new URL(base);
  if (origin.protocol !== 'https:' || !/(^|\.)commonswyft\.com$/.test(origin.hostname) || origin.username || origin.password) throw new Error('Policy pages are read from a commonswyft.com https address only.');
  const bundles = new Map(), pages = {};
  for (const page of PAGES) {
    const shell = await fetchText(new URL(page.path, origin), fetchImpl);
    const entry = /<script[^>]+src="(\/assets\/[\w.-]+\.js)"/.exec(shell)?.[1];
    if (!entry) throw new Error(`${page.path} did not reference a site script.`);
    if (!bundles.has(entry)) {
      const index = await fetchText(new URL(entry, origin), fetchImpl);
      const main = /"(assets\/main-[\w.-]+\.js)"/.exec(index)?.[1];
      bundles.set(entry, main ? await fetchText(new URL('/' + main, origin), fetchImpl) : index);
    }
    pages[page.key] = { url: new URL(page.path, origin).href, paragraphs: extractPolicyPage(bundles.get(entry), page.title) };
  }
  return pages;
}

// Which snapshot passages the site no longer shows, and which live paragraphs
// the snapshot lacks. An edited paragraph appears in both lists.
export function comparePolicy(snapshot, live) {
  const liveTexts = new Set(Object.values(live).flatMap(page => page.paragraphs.map(p => p.text)));
  const kept = new Set(snapshot.chunks.map(chunk => normalizePolicyText(chunk.text)));
  const removed = snapshot.chunks.filter(chunk => !liveTexts.has(normalizePolicyText(chunk.text)));
  const added = Object.entries(live).flatMap(([key, page]) => page.paragraphs.filter(p => !kept.has(p.text)).map(p => ({ page: key, ...p })));
  return { status: removed.length || added.length ? 'changed' : 'current', removed, added };
}

// A new snapshot in live order. An unchanged paragraph keeps its id, so
// citations and the fixed answers in policy.mjs that name it stay valid. A
// new or edited paragraph gets the next unused id, and an id whose text is
// gone disappears, which makes any fixed answer citing it fall back to
// retrieval instead of asserting old wording.
export function rebuildSnapshot(snapshot, live, capturedAt) {
  const byText = new Map(snapshot.chunks.map(chunk => [normalizePolicyText(chunk.text), chunk]));
  const next = {}; for (const chunk of snapshot.chunks) { const [key, n] = chunk.id.split('-'); next[key] = Math.max(next[key] ?? 0, Number(n)); }
  const chunks = [], used = new Set();
  for (const [key, page] of Object.entries(live)) for (const p of page.paragraphs) {
    const old = byText.get(p.text);
    const id = old && !used.has(old.id) ? old.id : `${key}-${(next[key] = (next[key] ?? 0) + 1)}`;
    used.add(id); chunks.push({ id, url: old?.url ?? page.url, text: old ? old.text : p.text });
  }
  return { ...snapshot, capturedAt, chunks };
}

async function main(argv) {
  const write = argv.includes('--write');
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  const baseArg = argv[argv.indexOf('--base') + 1];
  const base = argv.includes('--base') ? baseArg : new URL(snapshot.chunks[0].url).origin;
  let live;
  try { live = await fetchLivePolicy(base); }
  catch (error) { console.error(`Unknown: could not read the live policy from ${base}. ${error.message}`); return 2; }
  const result = comparePolicy(snapshot, live);
  const count = Object.values(live).reduce((n, page) => n + page.paragraphs.length, 0);
  if (result.status === 'current') { console.log(`Current: the snapshot from ${snapshot.capturedAt} matches all ${count} paragraphs on ${base}.`); return 0; }
  console.log(`Changed: ${base} differs from the snapshot captured ${snapshot.capturedAt}.`);
  for (const chunk of result.removed) console.log(`\n- no longer on the site: ${chunk.id}\n  ${chunk.text}`);
  for (const p of result.added) console.log(`\n+ new on the ${p.page} page${p.heading ? ` under "${p.heading}"` : ''}:\n  ${p.text}`);
  if (!write) { console.log('\nReview the wording, then run with --write and commit the snapshot with pnpm test passing.'); return 1; }
  writeFileSync(SNAPSHOT, JSON.stringify(rebuildSnapshot(snapshot, live, new Date().toISOString().slice(0, 10)), null, 2) + '\n');
  console.log('\nSnapshot rewritten. Run pnpm test: a fixed answer whose quote is gone now falls back to retrieval.');
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
