# Test matrix

| Layer | What it tests | Current evidence | Main limitation |
|---|---|---:|---|
| Deterministic suite | State, dates, validation, tools, policy grounding, preferences, security, API adapter, retries | Run locally on every change | Does not test model interpretation |
| Current Terra baseline | 18 conversational agent cases | 18 of 18 passed once | One attempt is a regression check, not a reliability estimate |
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
