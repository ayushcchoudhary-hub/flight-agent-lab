// Where the agent's data and pages live. Scripts in src, apps, evals and tools
// find them through here, so moving a script never changes where it reads or
// writes. Every directory constant ends without a separator; join onto it.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const AGENT_ROOT = fileURLToPath(new URL('.', import.meta.url));
export const agentPath = (...parts) => join(AGENT_ROOT, ...parts);

export const EVAL_RESULTS = agentPath('eval-results');
export const PUBLISHED_RESULTS = agentPath('published-eval-results');
export const LOCAL_STATE = agentPath('local-state');
export const TRACES = agentPath('traces');
export const ENV_FILE = agentPath('.env');
export const POLICY_SNAPSHOT = agentPath('src', 'policy-snapshot.json');
