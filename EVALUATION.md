# Evaluation contract

The frozen baseline uses Terra at medium reasoning against the behavior in
`agent/FROZEN-SCOPE.md` and prompt `flight-search-v1.2.0`.

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

Current results for prompt `flight-search-v1.2.0`:

- **73 of 73 deterministic checks pass**
- **14 of 15 agent acceptance cases passed in the bounded baseline**
- **The sole mismatch was an obsolete wording assertion. Its targeted replacement passed 1 of 1**
- **4 of 4 policy cases pass**
- **2 of 2 preference cases pass**

The v1.2 baseline used 17 model calls. The targeted correction used one more.
We did not repeat the other 14 passing cases merely to improve the headline.
