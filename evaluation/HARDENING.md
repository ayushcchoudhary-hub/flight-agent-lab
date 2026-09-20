# Terra hardening with an independent LLM judge

This phase asked a different question from model comparison: does the selected
Terra baseline handle a broader set of traveler language and boundaries well
enough to remain the default?

## Evaluation design

Forty-two cases were written before the frozen run. They cover incomplete and
ambiguous searches, natural dates, follow-ups, out-of-scope requests, policy,
refunds, existing bookings, purchase attempts, abuse and prompt attacks.

Each case has two independent gates:

1. **Exact checks** verify status, route, dates, state and tool behavior. These
   checks are authoritative for facts and actions.
2. **Claude Sonnet 4.6 low** reviews the visible reply for clarity, concision,
   tone, a useful next step, honest limitations and internal leakage.

The judge does not receive Terra's identity, hidden reasoning or credentials. A
judge score cannot excuse an exact failure. A pass requires every judge score to
be at least 4 out of 5, no major or critical issue, and every exact check to pass.
The judge returns a short structured audit rather than chain of thought.

## Frozen result

| Run | Prompt | Cases | Overall | Exact | Judge | Cost |
|---|---|---:|---:|---:|---:|---:|
| Frozen baseline | v1.4.0 | 42 | 30/42 | 39/42 | 30/42 | $0.3761 |
| Targeted correction | v1.4.0 | 12 | 7/12 | 10/12 | 7/12 | $0.1087 |
| Policy correction | v1.4.1 | 5 | 2/5 | 4/5 | 2/5 | $0.0683 |
| Final policy verification | v1.4.1 | 3 | 3/3 | 3/3 | 3/3 | $0.0308 |

Total observed model and judge cost was about **$0.584**. Conservative pre-call
reservation was higher because it assumes each call consumes its maximum output.

## What changed and why

| Finding | Correction | Why code rather than prompt alone |
|---|---|---|
| “Oct 2 2026” could be dropped | Preserve one explicit named calendar date | The application can verify the date without model judgment |
| A baggage guarantee could be ignored | Return a stable limitation before search | Silently dropping a requested constraint is unsafe |
| Ambiguous locations produced duplicate wording | Render one concise clarification | The application owns customer-facing clarification structure |
| Existing booking or purchase requests got weak pivots | Add contextual support or website-checkout handoffs | These boundaries should not vary by model output |
| Refund and legal-terms questions were swallowed by the booking boundary | Route policy intent before generic action boundaries | The words “ticket” and “purchase” do not always request an action |
| Direct policy evidence sometimes became a generic handoff | Require an evidence answer when a passage directly addresses the question | Retrieval should be useful, not ceremonial |
| The judge demanded a call to action after complete informational answers | Clarify that a complete answer can satisfy next step | This was rubric calibration, not an agent defect |
| An approved prototype policy URL was flagged as leakage | Pass an explicit approved-source allowlist to the judge | The judge should evaluate only the security boundary it was given |

## How to interpret the result

Every one of the 12 original reviews has a later targeted pass. The 42-case
suite was not rerun after the changes, so the evidence does not claim a final
42-of-42 score. The append-only reports preserve both failure and correction.
One attempt per case is regression evidence, not a production reliability rate.

The judge remains fallible. Its audit is useful because it makes communication
quality visible and reviewable, but deterministic checks and human review retain
release authority.

## Reproduce locally

```sh
cd agent
pnpm test
pnpm run eval
pnpm run eval:harden -- --live --max-cost=3 --max-calls=110
```

The live hardening command requires an OpenRouter key. It writes raw local
reports to an ignored directory and a sanitized, reviewable report to
`published-eval-results`.
