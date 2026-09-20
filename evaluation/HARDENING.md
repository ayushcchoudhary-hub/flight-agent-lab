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
| Interrupted independence rerun, rubric v1.1.0 | v1.4.1 | 7/42 | 5/7 | 7/7 | 5/7 | $0.0708 |
| Contract-aware rerun, rubric v1.2.0 | v1.4.1 | 33/42 | 32/33 | 32/33 | 32/32 judged | $0.2854 |

The first four runs cost about **$0.584**. The later interrupted and stopped
reruns added about **$0.3562**. Conservative pre-call reservation was higher
because it assumes each call consumes its maximum output.

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

## External review of the repair layer

A later code review tested the tool-argument repair function directly with
phrasings that appear in no evaluation suite. The function removed any field
whose wording was missing from a keyword list. It deleted correct model output
for 13 of 14 held-out phrasings, including "Oct 5", "in 3 days", "coach is
fine", "max 800", "show me the quickest" and "no layovers". The search then ran
on application defaults, which silently dropped the traveler's constraint.

The earlier fix for "Oct 2 2026" added one more pattern. That treated the symptom.
The keyword list was fitted to the phrasings in the development cases, so those
cases could not expose it.

The recorded traces show what the layer is for: models resend the whole trip
with default values during a follow-up. The rule now matches that failure only.

| Model output | No matching wording in the request | Reason |
|---|---|---|
| Default value, such as business cabin or the rolling date window | Removed | It would reset an earlier choice that the traveler did not ask to change |
| Non-default value | Kept and traced as `tool_argument_unverified` | It is the model's interpretation. A wording list cannot know every phrasing |
| Copy of the current trip value | Kept with no trace | It changes nothing |

The held-out phrasings are now a deterministic test file,
`agent/test/repair-heldout.test.mjs`. They pass 20 of 20, and the earlier repair
tests still pass. No paid model run was needed for this change.

Remaining limitation: if a model invents a non-default value that the traveler
never requested, the harness now keeps it. No recorded run shows that failure.
The new trace event makes it countable in the next live run.

## Judge independence

The judge input used to include the exact-check result, and the judge prompt
said a deterministic failure could never pass. In the frozen run, all three
exact failures also failed the judge, so those three communication scores were
not independent. The runner already requires both gates in code. The judge no
longer receives the exact-check result. The rubric version is now
`communication-quality-v1.1.0`. Judge results recorded under v1.0.0 stay as they
were and should not be compared score for score with later runs.

Rubric v1.2.0 gives the judge the frozen product contract without revealing
exact-check results. This was necessary because the interrupted rerun gave S06
and S07 synthetic-result limitations that passed elsewhere, then penalized the
documented cabin default, missing fixture fields and supposed real-world route
plausibility. The judge now grades only communication the reply controls, while
exact checks remain authoritative for facts and actions.

When every exact check passes but the first judge call does not, the runner now
judges the same transcript twice more and uses the majority of three. It stores
all verdicts and counts every call against the existing limits. A judge-only
flag does not stop the suite. Exact-check failures, provider outages and budget
caps do.

The v1.2.0 rerun completed 32 clean cases, then stopped at the first exact
failure as designed. B03 expected a `clarify` result for “Cancel my flight and
refund me.” The agent instead returned a safe `policy` response explaining that
refund eligibility depends on the ticket and directing the traveler to support.
The behavior did not claim a cancellation or refund, but it did not match the
frozen status contract. No prompt or expectation was changed in the result
commit, and the remaining nine cases were not run.

The stopped rerun recorded three `tool_argument_unverified` events. Each kept a
non-default `dates` field, and every associated exact check passed:

| Case | Traveler text | Kept fields |
|---|---|---|
| S06 | “NYC to SFO Oct 2 2026.” | `dates` |
| S11 | “London to New York on October 1, 2026.” | `dates` |
| S12 | “I need to get to Singapore next week.” | `dates` |

These traces show the repair layer preserving model interpretations that the
old wording list would have deleted. They do not prove that every kept
non-default value is correct, so the trace remains a review signal.

## How to interpret the result

Every one of the 12 original reviews has a later targeted pass. A later full
rerun was attempted after the repair and judge changes, but it stopped at B03
after 33 cases because of the frozen exact-check mismatch. The evidence does
not claim a final 42-of-42 score. The append-only reports preserve the original,
interrupted and stopped runs. One attempt per case is regression evidence, not
a production reliability rate.

The judge remains fallible. Its audit is useful because it makes communication
quality visible and reviewable, but deterministic checks and human review retain
release authority.

## Reproduce locally

```sh
cd agent
pnpm test
pnpm run eval
pnpm run eval:harden -- --live --max-cost=3 --max-calls=150
```

The live hardening command requires an OpenRouter key. It writes raw local
reports to an ignored directory and a sanitized, reviewable report to
`published-eval-results`.
