import { readFile, stat } from 'node:fs/promises';
import { createApiClient, flightSearchStatusQueryOptions } from './shared.mjs';
import { requestWithRetry } from './retry.mjs';

export const STAGING_BASE = 'https://api.staging.commonswyft.com/v1';
export async function readStagingToken(path = process.env.AGENT_STAGING_TOKEN_FILE) {
  if (!path) throw new Error('Staging needs a current login session. Set AGENT_STAGING_TOKEN_FILE to a private local file containing your staging session token. Do not paste it into chat.');
  const info = await stat(path);
  if (!info.isFile() || (info.mode & 0o077)) throw new Error('The staging token file must be readable only by your account (permissions 600).');
  const token = (await readFile(path, 'utf8')).trim();
  if (!token || /\s/.test(token)) throw new Error('The staging token file is empty or invalid.');
  return token;
}

// Only search creation and retrieval of searches created by this adapter are
// permitted. Redirects are disabled so a session bearer cannot leave staging.
export function makeStagingAdapter({ authMode = 'session', getToken = readStagingToken, fetchImpl = fetch, trace = () => {}, maxSearches = 5, maxPolls = 4, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  if (!['session', 'public'].includes(authMode)) throw new Error('Unknown staging auth mode.');
  const calls = [], snapshots = [], owned = new Set();
  let count = 0;
  const api = createApiClient(STAGING_BASE, {
    async onRequest({ request }) {
      const url = new URL(request.url);
      const isPost = request.method === 'POST' && url.pathname === '/v1/flight-searches';
      const id = url.pathname.startsWith('/v1/flight-searches/') ? decodeURIComponent(url.pathname.slice('/v1/flight-searches/'.length)) : null;
      const isGet = request.method === 'GET' && id && owned.has(id);
      if (url.origin !== new URL(STAGING_BASE).origin || url.search || (!isPost && !isGet)) throw new Error('Operation is outside the staging search-only allowlist.');
      const headers = new Headers(request.headers);
      if (authMode === 'session') headers.set('Authorization', `Bearer ${await getToken()}`);
      else headers.delete('Authorization');
      const body = isPost ? await request.clone().json() : undefined;
      const started = Date.now();
      let response;
      try {
        response = await requestWithRetry(
          () => fetchImpl(new Request(request, { headers, redirect: 'error', signal: AbortSignal.timeout(45000) })),
          {
            maxRetries: isGet ? 2 : 0,
            retryTransportErrors: Boolean(isGet),
            wait,
            onRetry: event => trace('flight_api_retry', { method: request.method, path: url.pathname, ...event }),
          },
        );
      } catch {
        throw new Error(isGet
          ? 'Flight search status could not be retrieved after bounded retries.'
          : 'Staging search creation failed or timed out. It was not retried because the outcome may be unknown.');
      }
      const event = { mode: 'staging', authMode, method: request.method, path: url.pathname, ...(body ? { body } : {}), status: response.status, latencyMs: Date.now() - started };
      calls.push(event); trace('flight_api', event);
      if (response.status === 401) throw new Error(authMode === 'public' ? 'Public staging search requires authentication on this deployment. No retry or account fallback was attempted.' : 'Staging login is missing or expired. Sign in again and refresh the local session token.');
      if (response.status === 403) throw new Error('The staging account is not permitted to search.');
      if (!response.ok) throw new Error(`Staging search unavailable (HTTP ${response.status}); this is not a no-results response.`);
      return response;
    },
  });
  return {
    mode: 'staging', authMode, calls, snapshots,
    async search(query) {
      if (count >= maxSearches) throw new Error('Staging session search limit reached.');
      count++;
      const body = { ...query };
      // Existing frontend omits cabin for "any" rather than sending the UI enum.
      if (body.cabin === 'any') delete body.cabin;
      const { data, error } = await api.POST('/flight-searches', { body });
      if (error || !data || typeof data.searchId !== 'string' || !/^[\w-]+$/.test(data.searchId)) throw new Error('Staging returned an invalid search identifier.');
      owned.add(data.searchId);
      const read = () => flightSearchStatusQueryOptions(api, data).queryFn();
      let result = await read(); // Uses the existing app's full response validation.
      for (let i = 0; i < maxPolls && result.comparisonStatus === 'pending'; i++) {
        const interval = Math.min(5000, Math.max(1000, Number(result.comparisonPollAfterMs) || 5000));
        await wait(interval);
        result = await read();
      }
      snapshots.push(result);
      trace('staging_snapshot', { searchId: result.searchId, totalFound: result.totalFound, comparisonStatus: result.comparisonStatus, providerStatuses: result.providerStatuses });
      return result;
    },
  };
}
