# Evaluation contract

The frozen behavior contract is in `agent/FROZEN-SCOPE.md`. The current prompt
is `flight-search-v1.3.0`. DeepSeek V4.1 Flash at low reasoning is the hosted
experiment default. Terra medium remains the proprietary control.

The suite separates three kinds of evidence:

1. Deterministic tests for validation, state, retrieval, security and rendering
2. Model acceptance cases for complete requests, missing information,
   follow-ups, ambiguity, no matches, unsupported requests and hostile input
3. A bounded live-search case that compares every displayed field with the
   response received by the adapter

Raw staging captures, credentials and full local transcripts are excluded from
version control. Local reports identify the prompt version, model, reasoning
effort, source hashes, call count, latency and token usage. A pass means the
recorded case met its assertions once. It is not a production reliability
estimate.

The deployed dashboard uses an allowlisted, sanitized evidence bundle. It keeps
the scenarios, customer-facing replies, grading, latency and token usage while
removing raw backend captures, source snapshots, source hashes, request
identifiers and private model thread identifiers.

Current results for prompt `flight-search-v1.3.0` and the explicit-field guard:

- **79 of 79 deterministic checks pass**
- **DeepSeek low passed 45 of 45 attempts across three full repeats**
- **A second full DeepSeek run also passed 45 of 45**
- **Terra medium passed 43 of 45 in the final same-path run; both misses were unreadable provider responses**
- **GLM high passed 43 of 45 in the preceding full run; both misses were repeated HTTP 429 responses**
- **4 of 4 policy cases pass**
- **2 of 2 preference cases pass**
- **The original one-pass screen retained results for ten OpenRouter configurations**

The final Terra-versus-DeepSeek run attempted 102 model calls, reported $0.114
of cost and reserved $0.208 conservatively where usage was unavailable. It
stayed below its $8 hard cap. Repeating development cases measures consistency
on those cases. It does not replace held-out language or production monitoring.
