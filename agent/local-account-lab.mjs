import {readFile} from 'node:fs/promises';
import {createPreferencesDevBackend} from './preferences-dev-backend.mjs';

const backend=await createPreferencesDevBackend();
process.env.AGENT_PREFERENCES_API_BASE=backend.baseURL;
process.env.AGENT_PREFERENCES_API_TOKEN=(await readFile(backend.tokenFile,'utf8')).trim();
await import('./dashboard-server.mjs');
