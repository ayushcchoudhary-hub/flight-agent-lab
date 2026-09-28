# Architecture decisions

## One bounded action per turn

The model selects one schema-valid action. The harness validates and executes
it. This is easier to test and safer than an autonomous loop for a search-only
product.

## Application-owned state and rendering

The application owns trip state, saved preferences, API credentials, response
validation and flight-card formatting. The model interprets language. It does
not own business truth or persistent memory.

## Tools for live data, retrieval for reference material

Flight availability comes from the search adapter. Policy answers use retrieved
approved passages. Account-specific questions would require an authenticated
account tool and are intentionally absent.

## Narrow, disclosed memory

Memory holds origins, not trip choices. Stating a home airport saves it, and
the last origin a browser searched from is offered back. Either is always
disclosed when it fills a new trip. Cabin and nonstop defaults are saved only
after the traveler accepts a proposal. Dates, cabin and budget never carry
into a new trip. Recent searches are listed at the start of a conversation and
can be run again by number, but never pre-fill a new request. "Forget" clears
each kind. Current instructions always override a saved default.

Storage is off on the live demo until the privacy page covers it. See
[MEMORY.md](MEMORY.md) for the reasoning and the plan.

## Deterministic safety controls

Tool allowlists, JSON schemas, endpoint allowlists, response validation, call
caps, timeouts, operation-specific retry bounds and customer-copy filters are
code, not prompt suggestions. Safe reads may retry. Search creation does not
retry without an idempotency key. See [RESILIENCE.md](RESILIENCE.md).

## Evaluation strategy

Code tests cover deterministic invariants. Model evaluations cover language
interpretation and end-to-end behavior. One baseline attempt per case detects
regressions without pretending to estimate production reliability. Repeats are
reserved for failures and high-risk behavior.

An independent LLM judge reviews only communication quality. Exact checks retain
authority over facts and actions. Judge disagreements remain visible and receive
human review before they motivate a change.

## Channel and transaction sequencing

Web and future WhatsApp clients call the same harness. A channel transports
messages and identity context but does not own travel logic or memory.

The first transactional expansion is offer selection followed by an
authenticated CommonSwyft checkout handoff. Direct payment, agent wallets and
autonomous purchase remain deferred. See [PRODUCT-ROADMAP.md](PRODUCT-ROADMAP.md).

## Deliberate non-goals

The current release does not book, pay, cancel, inspect accounts, support round
trips or operate as a general travel planner. It does not use multi-agent
coordination, autonomous reflection or MCP. Those features require a product
need and a new behavior contract.
