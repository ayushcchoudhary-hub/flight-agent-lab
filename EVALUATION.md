# Evaluation contract

The frozen baseline uses Terra at medium reasoning against the behavior in
`agent/FROZEN-SCOPE.md` and prompt `flight-search-v1.1.0`.

The suite separates three kinds of evidence:

1. Deterministic tests for validation, state, retrieval, security and rendering
2. Model acceptance cases for complete requests, missing information,
   follow-ups, ambiguity, no matches, unsupported requests and hostile input
3. A bounded live-search case that compares every displayed field with the
   response received by the adapter

Raw staging captures, credentials and full local transcripts are excluded from
version control. Reports identify the prompt version, model, reasoning effort,
source hashes, call count, latency and token usage. A pass means the recorded
case met its assertions once. It is not a production reliability estimate.

Current results for prompt `flight-search-v1.1.0`:

- **62 of 62 deterministic checks pass**
- **18 of 18 agent acceptance cases pass**
- **4 of 4 policy cases pass**
- **2 of 2 preference cases pass**
- **30 model calls total**, with one attempt per case
