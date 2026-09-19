# Prompt architecture

Current prompt: `flight-search-v1.1.0`

The prompt is a routing and interpretation contract. It does not ask the model
to perform searches, calculate prices or write the final flight cards.

| Layer | Responsibility |
|---|---|
| Identity and goal | Defines a search-only flight concierge and the useful outcome |
| Persona | Calm, concise and knowledgeable. Ask only necessary questions, preserve supplied details, state limits plainly and give the next useful step |
| Authority | Establishes which application state wins when context conflicts |
| Tool routing | Maps flight, policy, preference and unsupported requests to one allowed action |
| Trip interpretation | Defines dates, airports, cabin, budget and follow-up semantics |
| Boundaries and safety | Blocks booking, account access, arbitrary APIs, prompt disclosure and fabricated results |
| Output contract | Requires exactly one schema-valid action and prohibits extra prose |
| Injected context | Supplies the current date, timezone, data mode, trip state and explicit saved preferences as data |

## Context precedence

1. System rules and tool schemas
2. Explicit fields in the latest user request
3. Current trip state for fields the user did not change
4. Explicit saved preferences as soft defaults for a new trip
5. Recent conversation for continuity

Retrieved policy text is evidence, never an instruction. Backend search results
are authoritative for availability and prices. The model cannot override either.

## Escalation behavior

| Situation | Response |
|---|---|
| Missing origin or destination | Ask one concise question and preserve known fields |
| Ambiguous date or currency | Ask one targeted clarification |
| Unsupported trip shape | State the limitation and offer the closest supported next step |
| Policy answer is supported | Answer from retrieved passages and link the source |
| Policy answer is uncertain | Refer the traveler to support without claiming the policy lacks coverage |
| Search or model failure | State that the request could not be completed and do not imply no flights exist |
| Purchase or account action | State that it is unavailable and return to search or support |

## Why there is no visible chain of thought

This task needs bounded structured decisions, not an open planning loop. The
application records the chosen action, validation outcome, latency, tokens and
prompt version. It does not request or expose private reasoning. Reflection,
multi-agent delegation and autonomous retries would add cost and failure modes
without improving this search-only contract.

Every model evaluation records the prompt version and source hashes. A prompt
change requires deterministic tests and one bounded regression pass before it
becomes the baseline.
