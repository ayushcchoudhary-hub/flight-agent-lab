import { createInterface } from 'node:readline/promises';
import { stdin, stdout, loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { makeStagingAdapter, readStagingToken } from './staging.mjs';
import { makeFixtureAdapter } from './fixtures.mjs';
import { SearchConversation, isoToday, validDate, welcomeFor } from './search.mjs';
import { Agent, OpenRouterModel, ScriptedDemoModel } from './model.mjs';
import { fileTrace } from './trace.mjs';
import { CodexModel } from './codex-model.mjs';

const base = fileURLToPath(new URL('.', import.meta.url));
const demo = process.argv.includes('--demo');
// Offline mode intentionally never reads credentials.
if (!demo && existsSync(base + '.env')) loadEnvFile(base + '.env');
const timezone = process.env.AGENT_TIMEZONE || 'Europe/London';
const fixedDate = process.env.AGENT_TODAY;
if (fixedDate && !validDate(fixedDate)) throw new Error('Invalid AGENT_TODAY; use YYYY-MM-DD.');
isoToday(timezone); // Validate timezone before starting.
const session = fileTrace(base + 'traces', randomUUID());
const trace = session.emit;
let model;
try {
  model = demo ? new ScriptedDemoModel() : process.env.AGENT_PROVIDER === 'openrouter'
    ? new OpenRouterModel({ apiKey: process.env.OPENROUTER_API_KEY, model: process.env.AGENT_MODEL, trace })
    : new CodexModel({ model: process.env.AGENT_CODEX_MODEL || 'gpt-6-astra', effort: process.env.AGENT_REASONING || 'low', trace });
} catch (error) { console.error(error.message); process.exit(1); }
const staging = !demo && process.argv.includes('--staging');
if (staging) await readStagingToken(); // Fail before making any model call.
const adapter = staging ? makeStagingAdapter({ trace }) : makeFixtureAdapter('normal', trace);
const conversation = new SearchConversation({ adapter, today: () => fixedDate || isoToday(timezone), trace });
const agent = new Agent({ conversation, model, timezone, trace });
trace('session', { mode: model.mode, model: model.model ?? null, flightData: adapter.mode, timezone, fixedDate: fixedDate ?? null });
console.log(`\nCommonSwyft search lab — ${demo ? 'SCRIPTED DEMO (no LLM, no cost)' : `LIVE MODEL: ${model.model} (${model.mode}); ${adapter.mode} flights`}`);
console.log(welcomeFor(adapter.mode));
console.log('\nCommands: /state · /reset · /trace · /tool {JSON} · /quit');
if (demo) console.log('Start with: To New York → 1 → Heathrow only → economy instead → cheapest');
console.log('Use fictional travel details only. Local traces contain your trip preferences.\n');
const rl = createInterface({ input: stdin, output: stdout, terminal: stdin.isTTY });
rl.setPrompt('You > '); if (stdin.isTTY && !rl.closed) rl.prompt();
for await (const line of rl) {
  const text = line.trim();
  if (!text) { if (stdin.isTTY && !rl.closed) rl.prompt(); continue; }
  if (text === '/quit') break;
  if (text === '/trace') console.log(session.path);
  else if (text === '/state') console.log(JSON.stringify(conversation.publicState(), null, 2));
  else if (text === '/reset') { conversation.state = new SearchConversation({ adapter: conversation.adapter }).state; agent.turns = []; console.log('Trip reset.'); }
  else if (text.startsWith('/tool ')) {
    try { const result = await conversation.find(JSON.parse(text.slice(6))); trace('manual_tool_result', result); console.log(result.text); }
    catch { console.log('Use valid JSON, e.g. /tool {"origin":"London","destination":"New York"}'); }
  } else console.log(`\nAgent > ${(await agent.respond(text)).text}\n`);
  if (stdin.isTTY && !rl.closed) rl.prompt();
}
rl.close(); console.log(`Trace saved: ${session.path}`);
