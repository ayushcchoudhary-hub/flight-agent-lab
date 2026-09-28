import '../register.mjs';
import http from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { isRunKey, loadStory, readReport } from '../src/eval-story.mjs';
import { AGENT_ROOT } from '../paths.mjs';
// The local dashboard is read-only: it serves the pages and the evaluation
// reports. The chat runs on the hosted experiment, never from here.
const root = AGENT_ROOT;
const port = Number(process.env.AGENT_DASHBOARD_PORT || 5180);
// Raw local runs live in the ignored eval-results folder. A fresh clone has
// only the sanitized published reports, so read those instead.
const results = join(
  root,
  existsSync(join(root, 'eval-results')) ? 'eval-results' : 'published-eval-results',
);
const assets = {
  '/scope': ['scope.html', 'text/html'],
  '/policy-examples': ['policy-examples.html', 'text/html'],
  '/reply-preview': ['reply-preview.html', 'text/html'],
  '/compare': ['compare.html', 'text/html'],
  '/compare.js': ['compare.js', 'text/javascript'],
  '/compare.css': ['compare.css', 'text/css'],
  '/chat': ['chat.html', 'text/html'],
  '/chat.css': ['chat.css', 'text/css'],
  '/evals': ['index.html', 'text/html'],
  '/': ['overview.html', 'text/html'],
  '/overview.css': ['overview.css', 'text/css'],
  '/overview.js': ['overview.js', 'text/javascript'],
  '/dashboard.js': ['dashboard.js', 'text/javascript'],
  '/story.js': ['story.js', 'text/javascript'],
  '/dashboard.css': ['dashboard.css', 'text/css'],
};
const send = (res, status, value, type = 'application/json') => {
  res.writeHead(status, {
    'Content-Type': type + '; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
  });
  res.end(typeof value === 'string' ? value : JSON.stringify(value));
};
const server = http.createServer(async (req, res) => {
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host))
    return send(res, 403, { error: 'Local access only.' });
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  try {
    if (req.method !== 'GET') return send(res, 405, { error: 'Method unavailable.' });
    if (assets[url.pathname]) {
      const [file, type] = assets[url.pathname];
      return send(res, 200, await readFile(join(root, 'dashboard', file), 'utf8'), type);
    }
    if (url.pathname === '/api/comparisons') {
      const names = (await readdir(results, { withFileTypes: true }))
        .filter((x) => x.isDirectory() && /^compare-[\w.-]+$/.test(x.name))
        .map((x) => x.name)
        .sort()
        .reverse();
      return send(res, 200, { runs: names });
    }
    if (url.pathname === '/api/comparison') {
      const id = url.searchParams.get('id');
      if (!id || !/^compare-[\w.-]+$/.test(id))
        return send(res, 400, { error: 'Invalid comparison.' });
      return send(res, 200, JSON.parse(await readFile(join(results, id, 'report.json'), 'utf8')));
    }
    if (url.pathname === '/api/runs') {
      const names = (await readdir(results, { withFileTypes: true }))
        .filter(
          (x) =>
            x.isDirectory() &&
            /^live-[\w.-]+$/.test(x.name) &&
            existsSync(join(results, x.name, 'report.json')),
        )
        .map((x) => x.name)
        .sort()
        .reverse();
      return send(res, 200, { runs: names });
    }
    if (url.pathname === '/api/story')
      return send(
        res,
        200,
        (await loadStory(root)) ?? { milestones: [], headToHead: [], supporting: {} },
      );
    if (url.pathname === '/api/report') {
      const id = url.searchParams.get('id');
      if (!isRunKey(id)) return send(res, 400, { error: 'Invalid report.' });
      // A writer may be midway through replacing this local file; retry on the next poll.
      const { report, cases } = await readReport(results, id);
      return send(res, 200, {
        report,
        cases,
        updatedAt: (
          await stat(join(results, id.split('+').at(-1), 'report.json'))
        ).mtime.toISOString(),
      });
    }
    return send(res, 404, { error: 'Not found.' });
  } catch (e) {
    return send(res, e instanceof SyntaxError ? 503 : 404, {
      error: e instanceof SyntaxError ? 'Report updating; retry shortly.' : 'Report unavailable.',
    });
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(`Flight agent dashboard: http://127.0.0.1:${port}`),
);
server.on('error', (e) => {
  console.error(e.message);
  process.exitCode = 1;
});
