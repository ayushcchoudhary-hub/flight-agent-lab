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

## Explicit memory

Home airport, usual cabin and a soft nonstop preference may be saved only after
an explicit user action. A one-off search never silently becomes a permanent
preference. Current instructions override saved defaults.

## Deterministic safety controls

Tool allowlists, JSON schemas, endpoint allowlists, response validation, call
caps, timeouts, no automatic search retries and customer-copy filters are code,
not prompt suggestions.

## Evaluation strategy

Code tests cover deterministic invariants. Model evaluations cover language
interpretation and end-to-end behavior. One baseline attempt per case detects
regressions without pretending to estimate production reliability. Repeats are
reserved for failures and high-risk behavior.

## Deliberate non-goals

The current release does not book, pay, cancel, inspect accounts, support round
trips or operate as a general travel planner. It does not use multi-agent
coordination, autonomous reflection or MCP. Those features require a product
need and a new behavior contract.
