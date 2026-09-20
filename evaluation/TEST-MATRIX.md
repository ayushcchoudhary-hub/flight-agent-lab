# Test matrix

| Layer | What it tests | Current evidence | Main limitation |
|---|---|---:|---|
| Deterministic suite | State, dates, validation, tools, policy grounding, preferences, security, customer-copy guardrails, API adapter, retries | 98 of 98 pass locally | Does not test model interpretation |
| Terra hardening | 42 new search, policy, servicing and guardrail conversations | Frozen run 30 of 42 overall, 39 of 42 exact | One attempt per case, so not a reliability estimate |
| Targeted correction | Only cases reviewed in the frozen hardening run | Every original review has a later targeted pass | Full 42-case suite was not rerun |
| Current OpenRouter validation | 15 conversational agent cases, three fresh repeats | DeepSeek low 45/45; Terra medium 43/45; GLM high 43/45 | Development cases, not held-out requests |
| Policy acceptance | Retrieval, cited answers, safe support handoff | 4 of 4 passed once | Small approved document set |
| Preference acceptance | Explicit proposal, persistence boundaries | 2 of 2 passed once | Hosted demo still uses temporary in-memory preferences |
| Earlier repeated agent run | 15 scenarios across Astra and Luna, five repeats each | Astra 75 of 75, Luna 74 of 75 | Older prompt and harness version |
| Model screening | 15 scenarios across 12 model and effort configurations | 180 completed attempts | One repeat per configuration |
| Shortlisted comparison | Astra low, Luna low and Terra medium, five repeats planned | 151 completed attempts, 151 passed | Run stopped before all 225 planned attempts |
| Open-weight screen | Terra control plus DeepSeek, Mistral, Qwen and GLM across supported effort settings | 95 scenario attempts, 115 model calls; 3 configurations passed all 15 cases | One attempt per case; smoke failures stopped after four cases |
| Prompt and harness repair | Explicit dates and multi-turn field preservation | DeepSeek 6/6 targeted date/follow-up attempts; Terra and DeepSeek 6/6 targeted refinements | Targeted checks diagnose known failures, not general reliability |
| Focused regression | Natural day-month phrasing outside the original development set | Terra 1/1; DeepSeek 0/1 | One new case, now part of the regression suite |

The scenarios cover complete routes, missing airports, date interpretation,
follow-up changes, unsupported requests, empty or failed search results,
validation failures and prompt-injection attempts. Six comparison scenarios use
a pinned staging-derived fixture and nine use synthetic fixtures so every model
sees the same flight data.

No new high-repeat run is implied by this document. More repetitions would
reduce uncertainty about consistency, but held-out phrasings and targeted
failure cases would add more information than repeatedly rerunning only the
same development prompts.

## Model selection measurements

The screening run used one attempt for each of 15 scenarios. Every configuration
passed 15 of 15, so correctness acted as the entry gate. Latency, tokens and
estimated API-equivalent cost then informed the tradeoff.

| Model | Effort | Passed | Median time | Mean tokens / scenario | Estimated API $ / scenario |
|---|---|---:|---:|---:|---:|
| Astra | Low | 15/15 | 4.92 s | 12,203 | $0.1013 |
| Astra | Medium | 15/15 | 5.06 s | 12,203 | $0.1194 |
| Astra | High | 15/15 | 5.56 s | 12,209 | $0.1151 |
| Luna | Low | 15/15 | 4.79 s | 9,151 | $0.0016 |
| Luna | Medium | 15/15 | 5.02 s | 9,164 | $0.0016 |
| Luna | High | 15/15 | 6.13 s | 9,191 | $0.0017 |
| Sol | Low | 15/15 | 4.46 s | 10,836 | $0.0394 |
| Sol | Medium | 15/15 | 4.55 s | 10,846 | $0.0381 |
| Sol | High | 15/15 | 5.27 s | 10,856 | $0.0383 |
| Terra | Low | 15/15 | 4.37 s | 10,853 | $0.0168 |
| **Terra** | **Medium** | **15/15** | **4.12 s** | **10,849** | **$0.0153** |
| Terra | High | 15/15 | 4.39 s | 10,856 | $0.0147 |

These dollar values apply the rates stored with the run to observed token use.
They are estimates, not the bill for the Codex subscription that ran the test.
The dashboard retains the exact run and lets a reviewer inspect each scenario.

## OpenRouter screen

The open-weight screen used the same 15 cases, fixtures, fixed clock, prompt and
grader. The cost column uses OpenRouter's reported request cost when available.
Unknown usage remains unknown. The run recorded $0.0939 of reported cost and a
$0.0263 conservative reserve, below its $5 cap.

| Model | Effort | Passed | Median time | Mean tokens / scenario | Observed $ / scenario |
|---|---|---:|---:|---:|---:|
| Terra control | Medium | 15/15 | 2.39 s | 2,171 | $0.00378 |
| **DeepSeek V4.1 Flash** | **Low** | **15/15** | **1.45 s** | **2,833** | **$0.00018** |
| DeepSeek V4.1 Flash | High | 3/4 | 3.96 s | 4,461 | $0.00050 |
| Mistral Small 4 | None | 0/4 | 0.14 s | Unknown | Unknown |
| Mistral Small 4 | High | 0/4 | 0.17 s | Unknown | Unknown |
| Qwen3.6 35B A3B | Default | 14/15 | 1.79 s | 3,116 | $0.00039 |
| GLM 5.3 Flash | Low | 1/4 | 1.61 s | Unknown | Unknown |
| GLM 5.3 Flash | High | 2/4 | 3.15 s | Unknown | Unknown |
| GLM 5.3 | Low | 14/15 | 1.15 s | Unknown | Unknown |
| **GLM 5.3** | **High** | **15/15** | **1.40 s** | **2,531** | **$0.00092** |

Very short failed Mistral timings are request failures, not evidence that the
model completed the task quickly. Failed and incomplete configurations remain
visible and are excluded from the selection gate.

## Repeated OpenRouter validation

The first three-repeat run exposed a consistent DeepSeek failure to include an
explicit ISO date and a GLM mistake that simplified a round trip. A revised
prompt made the extraction rule explicit. The harness then added two general
guarantees: copy one unambiguous ISO date when a search action omits it, and
prevent a follow-up from changing fields the traveler did not mention. These
rules apply to every model and do not infer new preferences.

On the revised harness, DeepSeek passed all 45 attempts in two separate full
runs. The final same-path comparison recorded:

| Model | Effort | Passed | Median time | Mean tokens / scenario | Observed $ / scenario |
|---|---|---:|---:|---:|---:|
| Terra control | Medium | 43/45 | 1.80 s | Unknown | Unknown |
| **DeepSeek V4.1 Flash** | **Low** | **45/45** | **1.84 s** | **3,014** | **$0.000108** |

Terra's two failures were unreadable OpenRouter responses. In the preceding
three-model run, GLM high passed 43/45 with both failures caused by repeated
HTTP 429 responses after the one allowed retry. DeepSeek was the only candidate
to complete every planned check. The repeated data did not reproduce the
earlier four-times speed impression. It showed roughly equal median latency and
a large observed cost advantage for DeepSeek.

The later live date failure changed the product decision. Terra medium is the
hosted default. DeepSeek and GLM remain available in the frontend so their cost,
latency and behavior can continue to be compared without presenting them as the
recommended configuration.
