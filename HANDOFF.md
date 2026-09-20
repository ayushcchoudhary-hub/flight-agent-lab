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
- The deterministic suite currently contains 99 passing checks.
- The first 42-case Terra hardening run passed 30 cases. Every observed issue
  later received a focused passing verification. The full 42-case suite has not
  been rerun, so do not describe the result as 42 of 42.

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
