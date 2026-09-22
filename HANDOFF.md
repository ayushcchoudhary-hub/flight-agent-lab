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

- The live experiment is invite protected at
  <https://commonswyft-agent-experiment-868895912650.europe-west2.run.app>.
- Terra medium is the default model. DeepSeek V4.1 Flash low and GLM 5.3 high
  remain optional research controls in the live chat.
- All model traffic uses the OpenRouter adapter.
- The current prompt contract is `flight-search-v1.4.1`.
- The supported product scope is one-way flight search, policy retrieval,
  session follow-ups and explicit preference proposals.
- Booking, payment, account servicing, autonomous purchasing, WhatsApp and MCP
  remain outside the implemented scope.
- The deterministic suite currently contains 143 passing checks.
- The first 42-case Terra hardening run passed 30 cases. Every observed issue
  later received a focused passing verification. A later full rerun passed 32
  cases, then stopped at B03 after a safe policy handoff failed the frozen
  expected status. Nine cases were not run. Do not describe the result as 42 of
  42.
- Held-out v2 froze 30 populated cases before its first run. Terra passed 19
  exact contracts and 17 cases overall. The complete run used 74 calls and cost
  $0.3887. Keep the test-contract mistakes and judge-context issues visible when
  interpreting that score. See `evaluation/HARDENING.md`.
- A later run on 2026-09-20, after the place, currency, payment, date, policy
  and history corrections, passed 24 of 30 cases and 26 exact contracts, with
  no case regressing. It used 79 calls and cost $0.3813. The earlier baseline
  above stands as recorded; this is a later verification, not a replacement.
  Six cases still fail. A5, C1, C2 and C5 are model interpretation, not
  application defects: the model corrects "Sidney" to "Sydney" before the
  resolver sees it, reads "make it the 3rd" as picking option three, collapses
  a date range when applying a filter, and reads "and back to business" as a
  return flight. D2 and D4 pass every exact check and the judge asks for
  clearer disclosure. Two frozen expectations were corrected rather than the
  agent changed, and the reasoning is recorded beside the cases.
- A run on 2026-09-21, after the ambiguity rule (ask rather than search on a
  guess), verbatim place names, removal of invented dates and cabin-source
  labels, passed all 30 exact contracts and 27 of 30 cases. 87 calls,
  $0.6314. The judge ran at medium effort for the first time; at low effort
  it had passed and failed identical replies on consecutive runs. Three
  flags remain, all judge findings on wording: the UK menu stops at five
  with no hint that more exist, "Using the same results" reads wrongly when
  a filter change shows different rows, and a retention question gets a bare
  support redirect although the snapshot says analytics excludes search
  terms. Judge medium effort needs max_tokens above 900 or its JSON
  truncates; the harness now sets 2500 above low.

Read these files in order when more detail is needed:

1. [README.md](README.md) for the product story and system overview
2. [agent/FROZEN-SCOPE.md](agent/FROZEN-SCOPE.md) for the behavior contract
3. [PROMPT-ARCHITECTURE.md](PROMPT-ARCHITECTURE.md) for prompt and context rules
4. [ARCHITECTURE-DECISIONS.md](ARCHITECTURE-DECISIONS.md) for design choices
5. [EVALUATION.md](EVALUATION.md) for claims and evidence limits
6. [SECURITY-BOUNDARY.md](SECURITY-BOUNDARY.md) before publishing or integrating
7. [PRODUCT-ROADMAP.md](PRODUCT-ROADMAP.md) before expanding product scope

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

Repository review and deterministic development require only access to the
private GitHub repository. Live model evaluation also requires an independently
provided OpenRouter key with a low spending cap.

Deployment requires access to the personal Google Cloud project and its Cloud
Run service, build or artifact path, runtime service account and named secrets.
Grant the narrow roles needed for those tasks. Do not share secret values in a
handoff file. A successor can deploy without ever viewing the values if the
runtime service account already has secret access.

Protected CommonSwyft account features require a separately approved staging
authentication and API agreement. Access to the private product repository is
not part of this project handoff and should not be granted merely to continue
the agent lab.

## Context that is not transferred automatically

A new coding agent does not inherit the original chat, browser sessions, local
shell authentication, cloud login, secret values or ignored files. The tracked
repository is the durable source of truth. If a decision matters, record it in
the appropriate tracked document rather than relying on chat history.

Local ignored folders may contain historical raw reports or private reference
material. They are not required to run the public project and must not be
copied into a handoff bundle.

## Checkout handoff: where it stands (2026-09-22)

Phase 1 is built on branch `claude/search-handoff-link` and not yet merged:
every results reply links to the same search on commonswyft.com, so
selection, quoting and checkout happen on the product site. Held-out case
F1 pins it.

Phase 2, a checkout link by quote id, needs a Clerk session for the member:
`POST /checkout-quotes` is Clerk-authenticated and binds the quote to the
account. Options discussed, none decided:

- Serve the chat page from a CommonSwyft subdomain (Clerk shares sessions
  with subdomains by default). Needs one DNS record from CommonSwyft and a
  domain mapping or load balancer on this project; the backend stays here.
- Clerk OAuth, if CommonSwyft has its OAuth server enabled: the member
  consents once and the agent holds a scoped token. No domain change.
- A Clerk satellite domain does not fit: it requires a domain this project
  controls DNS for, and run.app is not one.

Questions for the CommonSwyft team are drafted in the chat history for
2026-09-21 and should be recorded here once answered.

## Conversation storage and memory: built, off (2026-09-22)

Conversations can be stored in Postgres for evaluation, and the last origin
a browser searched from can be offered back as a disclosed default. Both are
off unless `CONVERSATION_STORE=postgres` and `DATABASE_URL` are set.

- Schema: `agent/db/migrations/`, applied with `agent/tools/migrate.mjs` using
  the database owner login, passed for that command only and never stored.
- The application login is created by `agent/tools/create-app-role.mjs` in
  SQL, with row access only. Do not create it through a provider console:
  Neon adds console-created roles to an admin group.
- Development database: Neon, Frankfurt, Postgres 16. Production would move
  to the product's Postgres; the schema has nothing provider-specific.
- Text is redacted before it is written (emails, keys, card, phone and
  passport numbers). Conversations expire after 90 days and are purged hourly.
- A visitor is a random browser cookie, set only when storage is on. A
  browser can read back only its own conversations; no route lists them.
- Memory holds the last origin only. Cabin, dates and budget stay one-off.
  A saved home airport takes precedence.
- A storage failure is traced and never reaches the traveler.
- `agent/tools/store-smoke.mjs` checks all of this against a real database.

Before switching it on:

1. Add a privacy-page sentence on conversation storage and its retention.
2. Decide on held-out case D1. It asserts that a new conversation must not
   reuse London from a closed search. Remembering the last origin changes
   that for the origin only (economy must still not carry over). The case
   runs without storage, so it passes today, but its requirement no longer
   describes the product once storage is on.

## Recommended next decision

Keep the search contract stable while testing it with real users. The next
product expansion should be offer selection followed by an authenticated
checkout handoff, but only after an approved API contract defines identity,
authorization, quote expiry, revalidation and idempotency. Direct payment and
agent wallets are not prerequisites for that slice.

For further hardening, run a small held-out Terra set with the existing exact
checks and independent judge. Review the judge output before changing prompts.
Use findings to make targeted corrections, then preserve both the original and
verification reports.
