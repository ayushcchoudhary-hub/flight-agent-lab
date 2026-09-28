# Project handoff

This file gives a new human or coding agent enough context to continue the
Flight Agent Lab without the original conversation. Read it before changing
code, running paid evaluations or deploying.

## Objective

Build and evaluate a small conversational layer over an existing flight-search
API. The agent should help a traveler reach a useful next step while keeping
search execution, credentials, validation and customer-facing rendering in
application code.

This repository contains only the independent agent layer. It must never
contain CommonSwyft product source, internal documentation, credentials,
customer data or raw backend captures.

## Current state

- The live experiment is an invite-protected Cloud Run service. Its URL,
  revision history and rollback command are kept in an ignored local
  `OPERATIONS.md`, not in this public repository.
- Claude Sonnet 5.5 medium is the default model in code from 2026-09-28. The
  live service still runs Sonnet 5 (default from 2026-09-27) until it is
  redeployed with `OPENROUTER_MODEL=anthropic/claude-sonnet-5.5`. Sonnet 5
  medium, Terra medium, DeepSeek V4.1 Flash low and GLM 5.3 high remain
  optional controls in the chat.
- Live since 2026-09-27: Sonnet 5, prompt caching, take me anywhere and the
  guards against made-up values. Conversation storage stays off.
- Each result shows the product's cash comparison as "usually USD X" when the
  API priced one for the same flights (Google Flights), with one footnote
  naming the source. Pending, unavailable and expired comparisons are left out.
- Claude requests mark the fixed part of the system prompt, and the tools
  before it, for prompt caching. OpenAI models cache on their own. A 3-case
  check on 2026-09-27 read 4,771 prompt tokens from cache on every call after
  the first, cutting the cost of a warm call from about $0.011 to $0.002-0.005.
- The judge stays Claude Opus 5.5 at medium effort. It is the same model
  family as Sonnet 5, so it may favour Sonnet's wording. Exact checks and the
  made-up value count do not depend on the judge; read those first when
  comparing a Claude model with another family. Validating the judge against
  human labels is the open item.
- All model traffic uses the OpenRouter adapter.
- The current prompt contract is `flight-search-v1.7.0` (2026-09-27: the
  preference tool can forget recent searches). Each report records the
  version it ran on. The history is in `docs/PROMPT-ARCHITECTURE.md`.
- The supported product scope is one-way flight search, "take me anywhere"
  deals, a link to checkout on CommonSwyft, policy retrieval, session
  follow-ups, preference proposals and origin memory (built, off on the live
  service). `agent/FROZEN-SCOPE.md` is the contract.
- Booking, payment, account servicing, autonomous purchasing, WhatsApp and MCP
  remain outside the implemented scope.
- The deterministic suite currently contains 314 passing checks.
- Held-out evaluation: 38 of 47 on Terra (23 Sep), 42 of 47 on Sonnet 5
  with no made-up values. On the same 52 cases and code (28 Sep), Sonnet 5.5
  passed 51 with 52 exact and Sonnet 5 passed 46 with 51 exact; neither made
  up a value. The dated history is in
  [docs/evaluation/](docs/evaluation/README.md). When describing results:
  - The 42-case development set passed 30 on its frozen run. A full rerun
    stopped at B03 after 32, with nine cases unrun. Never call it 42 of 42.
  - The held-out v2 baseline (17 of 30) stands as recorded. Later runs are
    verifications, not replacements.
  - The judge changed twice and the case count grew from 30 to 47, so later
    scores are not directly comparable with earlier ones.

The Evals page opens on a milestone chart: one bar per complete run of the
held-out set, with what changed, why, and which cases were fixed, newly
flagged or newly failing. The prose lives in
`agent/published-eval-results/story.json`; every number is computed from the
reports by `agent/src/eval-story.mjs`. A test fails when a published hardening run
has no place in the story, so each new run must be added as a milestone, a
head-to-head run or a supporting run with a one-line reason. The Model
comparison page opens on the latest head-to-head pair from the same file.
Below the milestones, a trend section plots every milestone and head-to-head
run in date order: pass rate, exact rate, median time per traveler turn,
model cost per 1,000 turns and the share of prompt read from cache.

## Sonnet 5.5 (2026-09-28)

Released 2026-09-28 at Sonnet 5's price. It rejects a forced tool call
(OpenRouter finds no endpoint for `tool_choice: required`), as do Opus 5.5
and Fable 5.1, so the adapter sends those `auto` (`NO_FORCED_TOOL_CHOICE` in
`agent/src/model.mjs`). The prompt still asks for one tool and a reply without
one becomes the safe error.

Both models ran the same 52 held-out cases on the same code (f8a8ba9) with
the same judge and prompt caching, the same evening:

| | Sonnet 5 | Sonnet 5.5 |
|---|---|---|
| Cases passed | 46 | 51 |
| Exact checks passed | 51 | 52 |
| Made-up values | 0 | 0 |
| Median model call | 2.76 s | 1.56 s |
| Model cost per 1,000 traveler turns | $3.30 | $2.97 |

Sonnet 5's exact failure is C1 again ("make it the 3rd" read as 3 October).
Its other misses are judge flags on wording (A2, A4, B4, C3, D8). Sonnet
5.5's only miss is A2, which is the app's alphabetical UK airport menu,
open since 2026-09-21. Per call the two cost about the same; the fall from
Sonnet 5's earlier $11.19 per 1,000 turns is prompt caching, not the model.

The harness reserves worst-case cost ahead of each call, about three times
the real spend with caching, so both runs hit the $3.50 cap before the end
and were finished in parts within the remaining budget: Sonnet 5.5 in two
($1.73 real), Sonnet 5 in three ($1.99 real), plus $0.11 of smoke checks.

Sonnet 5.5 is the default in code and the first hosted option, with Sonnet
5 kept as an option. The live service changes only on a redeploy with
`OPENROUTER_MODEL` updated; the overview page's "Deployed on Cloud Run ·
Claude Sonnet 5" line should change with it.

Read these files in order when more detail is needed:

1. [README.md](README.md) for the product story and system overview
2. [agent/FROZEN-SCOPE.md](agent/FROZEN-SCOPE.md) for the behavior contract
3. [PROMPT-ARCHITECTURE.md](docs/PROMPT-ARCHITECTURE.md) for prompt and context rules
4. [ARCHITECTURE-DECISIONS.md](docs/ARCHITECTURE-DECISIONS.md) for design choices
5. [docs/evaluation/](docs/evaluation/) for the evaluation timeline, claims and evidence limits
6. [SECURITY-BOUNDARY.md](docs/SECURITY-BOUNDARY.md) before publishing or integrating
7. [PRODUCT-ROADMAP.md](docs/PRODUCT-ROADMAP.md) before expanding product scope

## Product principles

The assistant is a calm, concise and knowledgeable flight-search concierge.
It asks only necessary questions, preserves details already supplied, states
limitations plainly and helps the traveler reach the next useful step.

The model proposes one structured action. Application code validates that
action, selects an allowlisted operation and renders the reply. Do not move
credentials, arbitrary endpoint selection, state precedence or irreversible
actions into the model prompt.

Customer copy should use short direct sentences. Avoid em dashes, semicolons,
internal implementation details and unsupported claims.

## Working rules

- Keep each change tied to a named user problem or evaluation finding.
- Prefer a narrow deterministic fix when the requirement is deterministic.
- Add or update a regression case when behavior changes.
- Do not weaken an assertion just to make a model pass.
- Preserve failed evaluation evidence. Add a later verification instead of
  rewriting the earlier result.
- Use bounded call and spending limits for paid evaluation runs.
- Do not run large repeated suites unless the result will change a decision.
- Keep Git commits small enough to explain what changed and why.
- Run `pnpm run format` before committing. CI does not enforce it yet.
- Do not commit secrets, local state, traces, raw captures or private product
  material. Run the publication review before sharing access.

## Local verification

Use Node.js 24 and pnpm.

```sh
cd agent
pnpm install --frozen-lockfile
pnpm test
pnpm run dashboard
```

The deterministic tests and recorded dashboard need no API key. Paid live runs
require `OPENROUTER_API_KEY` through the process environment or an ignored local
environment file. Never paste a key into source, documentation, a prompt or a
GitHub issue.

Before committing, review:

```sh
git status --short
git diff --check
git diff
git ls-files
```

## Access a successor may need

Repository review and deterministic development need nothing beyond the public
GitHub repository. Live model evaluation also requires an independently
provided OpenRouter key with a low spending cap.

Deployment requires access to the personal Google Cloud project and its Cloud
Run service, build or artifact path, runtime service account and named secrets.
Grant the narrow roles needed for those tasks. Do not share secret values in a
handoff file. A successor can deploy without ever viewing the values if the
runtime service account already has secret access.

Protected CommonSwyft account features require a separately approved staging
authentication and API agreement. Read access to the product repositories
helps with context, such as the API contract, but is not required to continue
the agent lab. Nothing from them is copied here.

## Context that is not transferred automatically

A new coding agent does not inherit the original chat, browser sessions, local
shell authentication, cloud login, secret values or ignored files. The tracked
repository is the durable source of truth. If a decision matters, record it in
the appropriate tracked document rather than relying on chat history.

Local ignored folders may contain historical raw reports or private reference
material. They are not required to run the public project and must not be
copied into a handoff bundle.

## Checkout handoff: where it stands (2026-09-22)

Phase 1 is live: every results reply links to the same search on
commonswyft.com, so selection, quoting and checkout happen on the product
site. Held-out case F1 pins it.

Phase 2, a checkout link for a specific quote, needs the traveler to be
signed in to the product, because a quote is bound to an account. Two
approaches are open, none decided: serve the chat from a product subdomain so
the sign-in session is shared, or have the traveler grant the agent a scoped
token through OAuth. Either needs agreement with the CommonSwyft team.
Details are in the local `OPERATIONS.md`.

## Conversation storage and memory: built, off (2026-09-22)

Conversations can be stored in Postgres for evaluation, and the last origin
a browser searched from can be offered back as a disclosed default. Both are
off unless `CONVERSATION_STORE=postgres` and `DATABASE_URL` are set.

- Schema: `agent/db/migrations/`, applied with `agent/tools/migrate.mjs` using
  the database owner login, passed for that command only and never stored.
- The application login is created by `agent/tools/create-app-role.mjs` in
  SQL, with row access only. Do not create it through a provider console:
  Neon adds console-created roles to an admin group.
- Development database: Neon, Postgres 16. Production would move to the
  product's Postgres; the schema has nothing provider-specific.
- Text is redacted before it is written (emails, keys, card, phone and
  passport numbers). Conversations expire after 90 days and are purged hourly.
- A visitor is a random browser cookie, set only when storage is on. A
  browser can read back only its own conversations; no route lists them.
- Memory used as a default holds origins only: a home airport the traveler
  stated, then the last origin they searched from. Cabin, dates and budget
  never become defaults for a new trip.
- Recent searches (decision 2026-09-27, reversing "dates, cabin and budget
  are never stored"): every search that returned is kept per browser as a
  trip record: route, dates, a stated cabin, nonstop, budget and the lowest
  matching price seen. One row per route, the newest five, same 90-day
  expiry (`db/migrations/002_recent_searches.sql`). The welcome lists the
  latest three by number and the page skips the deals for that visitor.
  Choosing one runs it again live. A trip whose dates passed runs over the
  next 7 days and says so. Nothing from a recent search pre-fills a new trip,
  so held-out D1 still holds. The list is not in the model's context: "the
  Tokyo one again" is not understood yet, only its number or the route.
  "Forget my recent searches" deletes them and closes an open list.
  Held-out D6 to D10 pin this: pick up by number, forget recent searches
  and keep the origin, forget where I fly from, a recent search keeps the
  origin used rather than the home airport, and a new request ignores the
  list. The first Sonnet 5 run on 2026-09-27 (provisional ids D5 to D9)
  passed 7 of 9. Both failures were the application: the model sent the
  right forget list with action "show", and show returned before acting on
  it. An explicit forget now wins over the action, and D7 then passed live.
  A browser check against Neon confirmed the welcome list, "1" and forget
  end to end. See [MEMORY.md](docs/MEMORY.md)
  for the reasoning and the plan for what comes next.
- The stored lowest price is there for a later alert ("cheaper than when you
  looked"). That needs sign-in first: outreach needs a contactable,
  consenting account, not a browser cookie. With sign-in, key memory and
  recent searches by account and move a browser's rows to the account on
  first sign-in.
- Stating a home airport saves it, with no separate Save step (decision
  2026-09-23; held-out D2). On the hosted site it is kept per browser, and
  only when storage is on; with storage off the reply says it applies to
  this conversation only. The shared preference object is never written.
  Cabin and nonstop defaults remain proposals (held-out D4).
- "Forget my home airport" clears the home airport and the last searched
  origin for that browser, and drops a remembered origin from the current
  trip (2026-09-27). Before, the last origin survived and the next
  conversation reopened on it. Stored transcripts are not rewritten. They
  keep the 90-day expiry.
- A storage failure is traced and never reaches the traveler.
- `agent/tools/store-smoke.mjs` checks all of this against a real database.

Remaining before switching it on: add a privacy-page sentence on
conversation storage, recent searches and their retention.

Already done:

- 2026-09-27, Neon development database: `002_recent_searches.sql` applied, `agent_runtime` granted row access to
  `recent_searches`, and `tools/store-smoke.mjs` passed all 16 checks. The
  database held no rows before. For a new database, run
  `tools/create-app-role.mjs` after the migrations instead.
- 2026-09-23: held-out case D1 updated to the memory rule. The last origin
  carries over as a disclosed default, economy does not. The eval harness
  applies the same memory between sessions.

## Policy snapshot freshness (2026-09-27)

Policy answers come from `agent/src/policy-snapshot.json`, a reviewed copy of the
privacy and terms pages, not from the live page. `pnpm run policy:check`
reads the live pages and reports passages that changed. The site is a
single-page app, so it reads the wording from the site's script bundle.
It exits 0 when current, 1 when changed and 2 when the site could not be
read. `.github/workflows/policy-check.yml` runs it every Monday.

When it reports a change, review the wording, run `pnpm run policy:sync`,
then `pnpm test`. Unchanged passages keep their ids. A new or edited passage
gets a new id. A fixed answer in `src/policy.mjs` whose quote left the site
stops answering and the question goes to retrieval. On 2026-09-27 the
snapshot from 2026-09-19 matched all 12 paragraphs on staging and
production.

## Recommended next decision

Keep the search contract stable while testing it with real users. The next
product expansion should be offer selection followed by an authenticated
checkout handoff, but only after an approved API contract defines identity,
authorization, quote expiry, revalidation and idempotency. Direct payment and
agent wallets are not prerequisites for that slice.

For further hardening, run a small new held-out set on the default model with
the existing exact checks and independent judge. Review the judge output before changing prompts.
Use findings to make targeted corrections, then preserve both the original and
verification reports.
