# Evaluation contract

The frozen behavior contract is in `agent/FROZEN-SCOPE.md`. The current prompt
is `flight-search-v1.4.1`. Terra medium is the hosted experiment default.
DeepSeek V4.1 Flash low and GLM 5.3 high remain selectable research controls.

The suite separates four kinds of evidence:

1. Deterministic tests for validation, state, retrieval, security and rendering
2. Model acceptance cases for complete requests, missing information,
   follow-ups, ambiguity, no matches, unsupported requests and hostile input
3. A bounded live-search case that compares every displayed field with the
   response received by the adapter
4. Held-out hardening cases with exact assertions plus an independent LLM judge
   for clarity, concision, tone, next step, limitation honesty and leakage

Raw staging captures, credentials and full local transcripts are excluded from
version control. Published reports retain customer-visible replies, grading,
timing, token usage and judge audits while removing source hashes, request IDs
and private backend material. A pass means the recorded case met its assertions
once. It is not a production reliability estimate.

All new live runs use OpenRouter, including Terra. Historical Codex SDK reports
remain labelled as a different serving path and are not treated as directly
comparable latency evidence.

## Model selection evidence

- **106 of 106 deterministic checks pass**
- **DeepSeek low passed 45 of 45 attempts across three full repeats**
- **A second full DeepSeek run also passed 45 of 45**
- **Terra medium passed 43 of 45 in the final same-path run. Both misses were unreadable provider responses**
- **GLM high passed 43 of 45 in the preceding full run. Both misses were repeated HTTP 429 responses**
- **A focused new date case confirmed Terra preserved 3 October while DeepSeek used the default September window**
- **The original one-pass screen retains ten OpenRouter configurations**

The final Terra-versus-DeepSeek comparison attempted 102 model calls and
reported $0.114 in cost. Terra remains the default because correctness gates
speed and price, and the held-out date case exposed a material failure in the
otherwise strong DeepSeek result.

## Terra hardening and independent judge

The frozen hardening run executed 42 new conversations once with Terra medium.
Exact checks evaluated routes, dates, state, status and tool behavior. Claude
Sonnet 4.6 low independently reviewed only the visible reply and requirement.
It did not receive hidden reasoning or the candidate model label.

The first run passed 30 of 42 overall and 39 of 42 exact checks. Reviews showed
four useful patterns: an explicit named date could be lost, baggage language
could be ignored, existing-booking questions could receive the wrong next step,
and policy answers or handoffs could be too vague. One judge result also exposed
a rubric problem rather than an agent problem.

Changes were narrow and evidence-led: preserve named dates, intercept unsupported
baggage and consequential requests, route refund and legal-terms questions before
generic booking boundaries, require direct policy evidence when it exists, and
make support handoffs contextual. The rubric now treats a complete informational
answer as its own next step and accepts only source URLs explicitly supplied as
approved evidence.

The 12 reviewed cases were rerun, then only the five still unresolved, then the
last three. Every original issue has a later passing verification. A later full
rerun under the independent v1.2.0 judge contract passed 32 cases, then stopped
at B03 because a safe policy handoff did not match the frozen expected status.
Nine cases were not run. This remains regression evidence, not a 42-of-42
reliability estimate.

Across the baseline and three correction runs, candidate and judge calls cost
about **$0.584** in total. Reports remain visible on the Evals page, including
judge scores, rationale, issues and recommended action. The methodology and
limitations are detailed in [evaluation/HARDENING.md](evaluation/HARDENING.md).
