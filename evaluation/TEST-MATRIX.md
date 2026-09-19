# Test matrix

| Layer | What it tests | Current evidence | Main limitation |
|---|---|---:|---|
| Deterministic suite | State, dates, validation, tools, policy grounding, preferences, security, customer-copy guardrails, API adapter, retries | 73 of 73 pass locally | Does not test model interpretation |
| Current Terra baseline | 15 conversational agent cases | 14 passed, then the one corrected wording assertion passed in a targeted rerun | One attempt is a regression check, not a reliability estimate |
| Policy acceptance | Retrieval, cited answers, safe support handoff | 4 of 4 passed once | Small approved document set |
| Preference acceptance | Explicit proposal, persistence boundaries | 2 of 2 passed once | Hosted demo still uses temporary in-memory preferences |
| Earlier repeated agent run | 15 scenarios across Astra and Luna, five repeats each | Astra 75 of 75, Luna 74 of 75 | Older prompt and harness version |
| Model screening | 15 scenarios across 12 model and effort configurations | 180 completed attempts | One repeat per configuration |
| Shortlisted comparison | Astra low, Luna low and Terra medium, five repeats planned | 151 completed attempts, 151 passed | Run stopped before all 225 planned attempts |

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
