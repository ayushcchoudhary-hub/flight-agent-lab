# Flight Agent Lab

A bounded conversational layer over an existing flight-search API. The project
turns natural-language requests into validated search actions, preserves trip
state across follow-ups, grounds policy answers in approved material and renders
concise flight results. It never books or takes payment.

The live demonstration is deployed as an invite-protected Cloud Run service.
The repository is intentionally limited to the independent agent layer. It does
not contain or require the underlying product codebase.

## Project context and authorship

I help with CommonSwyft as a side project. The existing product offers web-based
flight search, and I wanted to explore another way for travelers to access that
capability: a conversational agent that could eventually work through web chat,
WhatsApp or another messaging surface. I used the existing search API boundary
and extended the agent-facing layer around it rather than rebuilding or
publishing the underlying product.

This is a product-led learning project, not a claim that I independently wrote
every line of production code. I am not a software engineer. I framed the
problem, read *Building AI Agents: From Design Patterns to Production*, and used
Codex to help design, implement, test and document the prototype.

I directed the work and made the product decisions: why an agent could improve
access to flight search, what it should do, what should stay out of scope, which
failures matter, how the conversation should feel, what evidence would support
a model choice, and where security and human approval boundaries belong. I
reviewed the behavior through the live demo and evaluation dashboard,
challenged confusing or incorrect outputs, and iterated on the architecture
with Codex.

The goal is to understand and communicate the system honestly. The code is
included so the decisions can be inspected and reproduced, not to imply that I
implemented it without AI assistance.

The [learning guide](LEARNING-GUIDE.md) is the plain-language walkthrough I use
to make sure I can explain every major component and tradeoff.

## What the system does

```mermaid
flowchart LR
  U[Traveler] --> C[Web chat or future channel]
  C --> H[Flight-agent harness]
  H --> M[Model: one structured action]
  H --> P[Policy retrieval]
  H --> S[Flight-search adapter]
  H --> R[Validated response renderer]
  S --> B[External search API]
  R --> C
```

- Interprets complete and partial one-way flight requests
- Applies explicit defaults and asks only for information that is required
- Preserves origin, destination, date, cabin, budget and constraints on follow-up
- Retrieves cited privacy and terms passages for general policy questions
- Proposes explicit travel-preference updates without silently saving them
- Validates every tool action and every backend response
- Records prompt version, model, effort, latency and tokens in evaluation reports

## Current product contract

Supported behavior is frozen in [FROZEN-SCOPE.md](agent/FROZEN-SCOPE.md). The
current prompt is `flight-search-v1.1.0`, described in
[PROMPT-ARCHITECTURE.md](PROMPT-ARCHITECTURE.md).

The assistant is a calm, concise and knowledgeable flight-search concierge. It
asks only necessary questions, preserves supplied details, states limitations
plainly and always offers the next useful step. Customer copy uses short direct
sentences and avoids em dashes and semicolons.

## Architecture

The model is an intent interpreter, not the application. It proposes exactly
one action from a four-tool allowlist:

| Tool | Purpose |
|---|---|
| `find_flights` | Search or refine a trip |
| `lookup_policy` | Retrieve evidence for a policy answer |
| `travel_preferences` | Show or propose explicit saved defaults |
| `clarify_request` | Ask one question or explain a boundary |

Application code owns credentials, state, API calls, response validation,
formatting and call limits. See [ARCHITECTURE-DECISIONS.md](ARCHITECTURE-DECISIONS.md).

## Evidence

- **66 of 66 deterministic checks pass** across routing, state, policy
  retrieval, preferences, output grounding, security and adapter behavior.
- The regression suite separates deterministic checks, model acceptance cases
  and one bounded live-search verification.
- Raw staging captures and transcripts stay local. Version control contains the
  methodology and sanitized aggregate evidence only.

See [EVALUATION.md](EVALUATION.md) for what a pass does and does not prove.
The [`evaluation/`](evaluation/) folder documents the test matrix, comparison
protocol, published evidence and limits of the conclusions.

## Security boundary

The project owns a narrow adapter contract and synthetic fixtures. It does not
import from the private product repository. Secrets, account data, raw backend
captures, internal documentation and source snapshots are excluded from Git.
See [SECURITY-BOUNDARY.md](SECURITY-BOUNDARY.md) and the
[publication checklist](PUBLICATION-CHECKLIST.md).

## Run locally

Requires Node.js 24 and pnpm.

```sh
cd agent
pnpm install --frozen-lockfile
pnpm test
pnpm run dashboard
```

Synthetic tests need no API key. The hosted model adapter reads its key from the
deployment secret manager. Credentials must never be added to this repository.

## Why the design stays small

The flow is dynamic enough to benefit from language interpretation and tool
selection, but bounded enough that an autonomous planning loop would add risk
without adding value. Multi-agent coordination, chain-of-thought capture,
open-ended retries and MCP are absent by design. Safe reads receive bounded
retries, temporary model HTTP failures receive one budgeted retry, and
operations with uncertain side effects are not retried. See
[RESILIENCE.md](RESILIENCE.md). New capabilities require a clear user need, a
tool contract and regression cases before they enter scope.

## What I should be able to explain

- Why this uses an LLM for language interpretation while keeping execution in
  deterministic application code
- The difference between the agent, its harness, the model and the external
  flight-search backend
- Why live flight availability uses a tool call and policy questions use
  retrieval-augmented generation
- How session state differs from persistent preferences and why preferences
  require explicit confirmation
- How context precedence prevents old state or saved defaults from overriding
  the traveler’s latest request
- Why the model proposes one structured action and cannot call arbitrary APIs
- How response validation, endpoint allowlists, call limits and no automatic
  search retries reduce risk
- What the frozen scope and regression suite establish, and what a passing test
  does not prove
- Why Terra medium was selected from the observed quality, latency and token
  tradeoff
- Why booking, payment, autonomous planning, multi-agent coordination and MCP
  remain outside the current version
