import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  extractPolicyPage,
  fetchLivePolicy,
  comparePolicy,
  rebuildSnapshot,
  normalizePolicyText,
} from '../tools/policy-sync.mjs';
import { groundedPolicyAnswer } from '../src/policy.mjs';

// The live site is a single-page app, so the policy wording sits in its
// script bundle. This is a made-up bundle with the same shape: an h1, plain
// paragraphs, a section heading, and a paragraph whose email is a variable
// rendered inside a link. None of it is the product's code or wording.
const page = (title, paragraphs) =>
  `function A(){return(0,G.jsxs)(\`div\`,{className:\`p-6\`,children:[(0,G.jsx)(\`h1\`,{className:\`text-2xl\`,children:\`${title}\`}),(0,G.jsx)(og,{children:(0,G.jsxs)(ug,{className:\`flex\`,children:[${paragraphs.join(',')}]})})]})}`;
const p = (text) => `(0,G.jsx)(\`p\`,{className:\`text-sm\`,children:\`${text}\`})`;
const h2 = (text) => `(0,G.jsx)(\`h2\`,{className:\`mt-2\`,children:\`${text}\`})`;
const contact = `(0,G.jsxs)(\`p\`,{className:\`text-sm\`,children:[\`Questions:\`,\` \`,(0,G.jsx)(\`a\`,{href:mk(\`Request\`),className:\`underline\`,children:em}),\`.\`]})`;
const bundle = ({
  retention = 'We keep search logs for one year. Replays are kept for 30 days.',
} = {}) =>
  `var em=\`help@example.test\`;` +
  page('Privacy Policy', [
    p('We never sell your details.'),
    h2('Retention'),
    p(retention),
    contact,
  ]) +
  page('Terms & Conditions', [p('These terms are a draft.')]) +
  'function Z(){}';

test('reads paragraphs, headings and a linked email from the bundle', () => {
  assert.deepEqual(extractPolicyPage(bundle(), 'Privacy Policy'), [
    { heading: null, text: 'We never sell your details.' },
    {
      heading: 'Retention',
      text: 'We keep search logs for one year. Replays are kept for 30 days.',
    },
    { heading: 'Retention', text: 'Questions: help@example.test.' },
  ]);
  assert.deepEqual(extractPolicyPage(bundle(), 'Terms & Conditions'), [
    { heading: null, text: 'These terms are a draft.' },
  ]);
});

test('a site whose structure changed is unknown, not current', () => {
  assert.throws(
    () => extractPolicyPage('function A(){return null}', 'Privacy Policy'),
    /not found/,
  );
  assert.throws(
    () => extractPolicyPage(page('Privacy Policy', [p('Total: ${n} days')]), 'Privacy Policy'),
    /computed value/,
  );
});

const site = (files) => async (url) => {
  const body = files[new URL(url).pathname];
  return body === undefined
    ? { ok: false, status: 404 }
    : { ok: true, status: 200, text: async () => body };
};
const shell =
  '<!doctype html><script type="module" crossorigin src="/assets/index-a1.js"></script><div id="root"></div>';
const files = (retention) => ({
  '/privacy': shell,
  '/terms': shell,
  '/assets/index-a1.js': 'import("assets/main-b2.js")',
  '/assets/main-b2.js': bundle({ retention }),
});

test('follows the page shell to the main bundle, once for both pages', async () => {
  let calls = 0;
  const fetchImpl = site(files());
  const live = await fetchLivePolicy('https://staging.commonswyft.com', async (url) => {
    calls++;
    return fetchImpl(url);
  });
  assert.equal(live.privacy.url, 'https://staging.commonswyft.com/privacy');
  assert.equal(live.privacy.paragraphs.length, 3);
  assert.equal(live.terms.paragraphs[0].text, 'These terms are a draft.');
  assert.equal(calls, 4, 'two shells, one entry script, one main bundle');
});

test('reads only commonswyft.com over https', async () => {
  for (const base of [
    'http://commonswyft.com',
    'https://commonswyft.com.evil.test',
    'https://example.com',
    'https://user:pw@commonswyft.com',
  ])
    await assert.rejects(fetchLivePolicy(base, site(files())), /commonswyft\.com https/);
});

test('a missing page is reported as an error, never as unchanged', async () => {
  const broken = { ...files(), '/terms': undefined };
  await assert.rejects(fetchLivePolicy('https://commonswyft.com', site(broken)), /HTTP 404/);
});

const snapshotFrom = (live) => ({
  source: 'test',
  capturedAt: '2026-01-01',
  chunks: [
    ...live.privacy.paragraphs.map((x, i) => ({
      id: `privacy-${i + 1}`,
      url: live.privacy.url,
      text: x.text,
    })),
    ...live.terms.paragraphs.map((x, i) => ({
      id: `terms-${i + 1}`,
      url: live.terms.url,
      text: x.text,
    })),
  ],
});

test('an edited paragraph shows as removed and added, and keeps other ids', async () => {
  const before = await fetchLivePolicy('https://commonswyft.com', site(files()));
  const snapshot = snapshotFrom(before);
  assert.equal(comparePolicy(snapshot, before).status, 'current');
  const after = await fetchLivePolicy(
    'https://commonswyft.com',
    site(files('We keep search logs for two years. Replays are kept for 30 days.')),
  );
  const diff = comparePolicy(snapshot, after);
  assert.equal(diff.status, 'changed');
  assert.deepEqual(
    diff.removed.map((c) => c.id),
    ['privacy-2'],
  );
  assert.deepEqual(
    diff.added.map((a) => [a.page, a.heading, a.text]),
    [['privacy', 'Retention', 'We keep search logs for two years. Replays are kept for 30 days.']],
  );
  const rebuilt = rebuildSnapshot(snapshot, after, '2026-02-02');
  assert.equal(rebuilt.capturedAt, '2026-02-02');
  assert.deepEqual(
    rebuilt.chunks.map((c) => c.id),
    ['privacy-1', 'privacy-4', 'privacy-3', 'terms-1'],
    'unchanged ids stay, the edit gets a new one, live order is kept',
  );
  assert.equal(comparePolicy(rebuilt, after).status, 'current');
});

test('spacing and a space before punctuation are not a policy change', () => {
  assert.equal(
    normalizePolicyText('Questions or deletion requests: support@commonswyft.com .'),
    'Questions or deletion requests: support@commonswyft.com.',
  );
});

// The fixed privacy answers in policy.mjs cite passages by id. After a
// rebuild, an answer whose wording left the site must stop answering.
test('a fixed answer whose passage changed falls back to retrieval after a rebuild', () => {
  const snapshot = JSON.parse(
    readFileSync(new URL('../src/policy-snapshot.json', import.meta.url), 'utf8'),
  );
  const question = 'how long do you keep my searches?';
  assert.ok(groundedPolicyAnswer(question, snapshot), 'answers today');
  const live = {
    privacy: { url: 'https://staging.commonswyft.com/privacy', paragraphs: [] },
    terms: { url: 'https://staging.commonswyft.com/terms', paragraphs: [] },
  };
  for (const chunk of snapshot.chunks) {
    const text =
      chunk.id === 'privacy-8'
        ? 'Analytics events are kept for two years.'
        : normalizePolicyText(chunk.text);
    live[chunk.id.split('-')[0]].paragraphs.push({ heading: null, text });
  }
  const rebuilt = rebuildSnapshot(snapshot, live, '2026-10-01');
  assert.ok(!rebuilt.chunks.some((c) => c.id === 'privacy-8'));
  assert.equal(groundedPolicyAnswer(question, rebuilt), null);
});
