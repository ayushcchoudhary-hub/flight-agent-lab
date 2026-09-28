# Memory and retrieval

What the agent remembers, where it is kept, how it is read back, and what to
build next. Written 2026-09-27. HANDOFF.md holds the current state; this file
holds the reasoning and the plan.

## Terms used here

- **Context** is what the model reads on one call. Stored data reaches the
  model only if code puts it there.
- **State** is the current trip in this conversation. It lives in the
  server's memory and ends with the conversation.
- **Memory** is what is kept for the next conversation. Here it is rows in
  Postgres, keyed by browser.
- **Retrieval** is finding the right stored text or rows for this turn. A
  lookup by key is retrieval. So is search. Neither needs vectors.

## What exists

| Capability | Kind | Stored in | Read how | Reaches the model? |
|---|---|---|---|---|
| Current trip (route, dates, cabin, filters) | State | Server memory, per conversation | Merged on each follow-up | Yes, every turn, as data |
| Last four turns | State | Server memory | Last four, capped at 24k characters | Yes |
| Saved home airport | Memory (a fact) | `visitor_memory.home_origin` | Key lookup at chat start | Yes, as a disclosed default |
| Last searched origin | Memory (a fact) | `visitor_memory.last_origin` | Key lookup at chat start | Yes, as a disclosed default |
| **Recent searches** (added 2026-09-27) | Memory (past events) | `recent_searches` | Key lookup, newest three | **No.** Shown in the welcome, run by number |
| Transcripts | Record for evaluation | `messages` | Never read back | No |
| Privacy and terms | Knowledge | `policy-snapshot.json` | Whole document on a policy question | Yes, as evidence, then quotes checked |
| Flights and prices | Live data | Flight API | Fetched on every search | Result fields only |

Everything in Postgres exists only when `CONVERSATION_STORE=postgres`. The
live site has it off. The Neon development database holds no traveler data:
it was empty when migration 002 was applied on 2026-09-27, and the smoke
check deletes its own test visitors.

## What was added on 2026-09-27

1. **Pick up where you left off.** Each search that returns is kept as a trip
   record: route, dates, a cabin only if the traveler chose one, nonstop,
   budget and the lowest matching price. One row per route, newest five, 90
   days. The next welcome lists three. "1" runs that trip again live. A
   typed request starts fresh, so nothing from an old trip leaks in.
2. **Forget works.** "Forget where I fly from" clears the home airport and
   the last origin, and drops a remembered origin from the current trip.
   "Forget my recent searches" deletes them and closes an open list.
3. **Policy freshness.** `pnpm run policy:check` compares the snapshot with
   the live pages every Monday. The agent still answers from the reviewed
   snapshot.

Evidence: 16 checks against the Neon database (`tools/store-smoke.mjs`),
unit tests in `test/recent-searches.test.mjs` and `test/policy-sync.test.mjs`,
and held-out cases D6 to D10 replayed through the eval harness with the
intended tool calls and with the calls Sonnet 5 actually made.

## Next, in order

### 1. Verify with the live model and a browser (done 2026-09-27)

- Held-out D1, D2, D4 and the new cases on Sonnet 5: 7 of 9 passed, 25
  calls, $0.35. Both failures were the application: the model sent the
  right forget list with action "show", and show dropped it. Fixed so an
  explicit forget always wins. D7 then passed live (3 calls, $0.03). D8 was
  not rerun to stay within the 30-call cap; a test replays its recorded
  calls through the fixed code.
- Browser, local server against Neon: first visit shows deals. After one
  search and a reload the welcome lists it. "1" ran it again live with no
  model call. "Forget my recent searches" cleared the database rows, and the
  next reload showed deals again. Test rows were deleted afterwards.
- Both runs are published and listed in the evaluation story.

### 2. Switch memory on for the experiment (small)

Why: memory that is off teaches nothing about real use. Transcripts from
real visitors are also the evidence items 5 and 6 below depend on.

- Add the privacy-page sentence on conversation storage, recent searches and
  retention. This is the gate HANDOFF already names.
- Deploy with `CONVERSATION_STORE=postgres`, pointing at the Neon database.
- Watch the `store_error` traces for a week.

### 3. Recent searches in the model's context (medium)

Why: "search the Tokyo one again" or "same as last time but economy" fails
today. The traveler must use the number.

- Add the three recent searches to the injected context, labelled as past
  searches, not current trip values.
- The repair layer treats a value copied from them like a saved default: it
  is kept only when the request names it. This is the same guard that fixed
  held-out D2.
- Prompt contract minor version bump.
- New held-out cases: refer to a recent trip by place name, change one field
  of it, and a request that must not borrow from it.

Risk: the model fills a new trip from an old one. D1 and D10 catch that.

### 4. Account-keyed memory (after sign-in)

Why: a browser cookie is lost on another device and cannot be contacted.

- Add `account_id` to `visitor_memory` and `recent_searches`. Read by
  account when signed in, by browser otherwise.
- On first sign-in, move the browser's rows to the account, newest wins.
- Deleting the account deletes its memory.
- Tests: two accounts never see each other's rows, and the merge keeps the
  newest row per route.

### 5. Saved searches and price-drop alerts (after 4)

Why: this is the proactive step. It is a product feature built on memory,
not more memory.

- A `saved_searches` table: account, route, dates, cabin, target price,
  channel, consent time, and last price notified.
- Created only when the traveler asks ("tell me if this gets cheaper"). A
  recent search is never promoted without that request.
- A scheduled job re-runs each saved search, compares the price with
  `lowest_price_usd`, and sends at most one message per drop.
- It sends through a channel CommonSwyft controls: email first. WhatsApp
  needs opt-in and approved message templates for outreach.
- Other assistants that call our tools can list or create saved searches.
  They cannot receive our alerts, because a tool server cannot message
  through someone else's assistant.

### 6. Airline and fare knowledge (only with evidence)

Why: questions such as "what does this fare include" need airline rules. The
policy approach does not scale to many airlines.

- First ask CommonSwyft for fare conditions on each offer (refund, change,
  bags). The API contract has none today. Conditions for the ticket are live
  data, more exact than any document.
- If general airline questions show up in transcripts, write one short page
  per airline fare family. Look it up by airline and fare family, and send
  it whole, like the policy. Reuse the freshness check per source.
- Move to search, and then to vectors, only when a measured trigger below is
  met.

## When vectors are worth it

Use embeddings when all of these hold:

- There is too much text to send whole. Many airlines' conditions of
  carriage is an example. The policy pages are 3.4 KB and are not.
- Questions use different words from the source, and keyword search is
  shown to miss them on a set of real questions.
- The thing you need cannot be found by an exact key. Recent searches, home
  airports and fare family pages all have keys.

Where they would live: the same Postgres, using the `pgvector` extension,
which Neon and Cloud SQL both offer. One table holds each passage's text,
source, section, version, access scope and embedding. Postgres full-text
search in the same query gives keyword matching for fare codes and airline
names. There is no separate vector service to run, secure or back up. The
embedding model is a separate API call. Changing that model means
re-embedding everything and switching over deliberately.

## Frameworks

LangChain and LlamaIndex wrap the same steps: split, embed, store, search,
and assemble the prompt. This project does each in a few dozen lines of Node,
with validation at every step, over one small OpenRouter adapter. A framework
would add a large dependency and hide the steps that matter most here:
evidence checks, access scope and state precedence. Reconsider it only if
the retrieval work grows to many source types and connectors.
