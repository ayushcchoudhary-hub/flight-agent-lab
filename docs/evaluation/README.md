# Evaluation

How the agent was evaluated, in the order it happened, and what each result
does and does not support. The interactive **Evals** and **Model comparison**
pages in the demo show the same runs case by case. Every number below is
computed from the sanitized reports in
[`agent/published-eval-results`](../../agent/published-eval-results).

## Evidence layers

1. **Deterministic tests** (314, no API key needed) check application rules:
   state merging, validation, endpoint restrictions, policy citations,
   response grounding, memory, retry bounds and customer-copy guardrails.
   Run them with `cd agent && pnpm test`.
2. **Development cases** (15) check that a model turns natural language into
   the expected structured action. They were used to compare models and were
   tuned against, so they are not held out.
3. **Held-out cases** (30, later 36 and 47) were written and frozen before the
   agent saw them. Each case has two gates:
   - **Exact checks** decide status, route, dates, state and tool behavior.
     They are authoritative for facts and actions.
   - **An independent LLM judge** grades only the visible reply for clarity,
     concision, tone, next step, honest limitations and internal leakage. It
     never sees the model's identity or the exact-check result, and it cannot
     excuse an exact failure.

A case passes only when every exact check passes and the judge scores every
criterion at least 4 of 5 with no major issue. One attempt per case is
regression evidence, not a production reliability estimate.

## Timeline

### 19 September · Choosing a first model on development cases

Twelve OpenAI configurations (Astra, Luna, Sol and Terra at three reasoning
levels) all passed the 15 development cases through the Codex SDK. Terra medium
was chosen for its speed. All later runs moved to one OpenRouter adapter, and
an open-weight screen added DeepSeek V4.1 Flash, GLM 5.3, Qwen 3.6 and Mistral
Small. In three-repeat validation DeepSeek low passed 45 of 45 twice and cost
far less, but a new live request ("London to New York on 3 October") showed it
dropping the date. Terra stayed the default on that one case. Details:
[MODEL-COMPARISON.md](MODEL-COMPARISON.md) and [TEST-MATRIX.md](TEST-MATRIX.md).

### 20 September · A development hardening set, and why it was retired

42 new conversations with the first independent judge (Claude Sonnet 4.6, low
effort). Terra passed 30 of 42, and 39 of 42 on exact checks. Every failure
later received a focused passing verification. A full rerun passed 32, then
stopped at B03 on a frozen expectation, with nine cases unrun. **There is no
42 of 42 claim.** Because the agent had then been tuned against this set, a
fresh held-out set replaced it. Details: [HARDENING.md](HARDENING.md).

### 20 to 27 September · The held-out set

| Date | Run | Cases | Passed | Exact | What changed |
|---|---|---:|---:|---:|---|
| 20 Sep | Held-out baseline | 30 | 17 | 19 | Frozen before the first run. Known gaps left unfixed so the score is honest |
| 20 Sep | Places, money, payment, dates | 30 | 24 | 26 | Real airport list, USD-only budgets, a saved card never authorizes payment, no invented dates |
| 21 Sep | Ask, don't guess | 30 | 25 | 29 | Ambiguous requests get a question rather than a search on a guess |
| 21 Sep | A steadier judge | 30 | 27 | 30 | Judge effort low to medium. At low effort it graded identical replies differently on consecutive runs |
| 22 Sep | Checkout link, six reply fixes | 36 | 31 | 35 | Results link to the same search on CommonSwyft. Six new cases. Judge moved to Claude Opus 5.5 |
| 22 Sep | Take me anywhere added | 47 | 28 | 35 | Eleven new deal-discovery cases. All failed exact checks at first: the app treated empty model values as real filters |
| 23 Sep | Empty values, memory | 47 | 37 | 44 | Empty values ignored. Last-used origin remembered and disclosed. Stating a home airport saves it |
| 23 Sep | Home disclosure, invented cabins | 47 | 38 | 46 | A cabin the traveler never mentioned is dropped |

After the 20 September corrections, four failures were the model's reading
rather than an application defect: it corrected "Sidney" to "Sydney" before
the place resolver saw it, read "make it the 3rd" as picking option three,
collapsed a date range when applying a filter, and read "and back to business"
as a return flight. The next run made the agent ask instead of guessing. After
21 September three judge flags remained, all on wording: a country menu that
stops at five airports with no hint that more exist, "Using the same results"
when a filter change shows different rows, and a bare support redirect for a
retention question the policy snapshot partly answers. Above low effort the
judge needs room to reason: at 900 output tokens its JSON was cut off, so the
harness allows 2,500.

Case counts grow from 30 to 47 and the judge changes twice, so a later score is
not directly comparable with an earlier one. The Evals page shows, case by
case, what each run fixed, newly flagged or newly broke. Two frozen
expectations were corrected rather than the agent changed. The reasoning is
recorded beside those cases.

### 23 September · Head-to-head on the same 47 cases

| Model | Passed | Exact | Values the model made up | Median model call | Model cost per 1,000 turns |
|---|---:|---:|---:|---:|---:|
| GPT-5.6 Terra, medium | 38 | 46 | 1 | 3.1 s | $4.13 |
| GPT-6 Sol, medium | 38 | 45 | 9 | 2.6 s | $3.51 |
| Claude Sonnet 5, medium | 42 | 45 | 0 | 2.4 s | $11.19 |

Terra and Sol ran on the same code (`52d80c5`). Sonnet 5 ran later on
`c6bf7c0`, which adds guards against made-up values. The made-up count comes
from each model's own tool calls, so that column is fair across the two
commits. On exact checks the three models are within one case. Sonnet's lead is
in judge-graded replies, and the judge is also a Claude model (see Limits).

### 27 September · Sonnet 5 becomes the default

Sonnet 5 passed the most held-out cases and made up no values in any tool
call. Its cost was the concern. A three-case check then confirmed prompt caching for Claude
requests: every call after the first read 4,771 prompt tokens from cache,
cutting a warm call from about $0.011 to $0.002 to $0.005.

### 27 September · Memory: recent searches and forgetting

Five new held-out cases (D6 to D10) cover picking up a recent search, forgetting
recent searches, forgetting where the traveler flies from, and a new request
that must ignore the list. Sonnet 5 passed 7 of 9 across these and the earlier memory cases (D1, D2,
D4 and D5). Both
failures were the application, not the model: it sent the right forget list
with the action "show", and "show" returned before acting on it. After the fix,
D7 passed live. D8 was not rerun to stay within the call cap. A deterministic
test replays its recorded calls through the fixed code.

### 28 September · Sonnet 5.5

Sonnet 5.5 came out at Sonnet 5's price. Its first smoke run returned the
safe error for every case at no cost: it rejects a forced tool call, so the
adapter now sends it `tool_choice: auto`. On all 52 held-out cases it then
passed 51, with every exact check passing and no made-up values. The one
judge flag (A2) is the application's alphabetical UK airport menu, raised
before on 21 September.

Sonnet 5 was then rerun on the same 52 cases and code, with caching, so the
two compare directly. Sonnet 5 passed 46 with 51 exact checks and no made-up
values. Its exact failure was C1 again ("make it the 3rd" read as 3
October), and its other misses were judge flags on wording. Sonnet 5.5's
median model call took 1.6 seconds against Sonnet 5's 2.8, at about the same
cost per call. Its cost per 1,000 traveler turns, $2.97 against $3.30, is the
lowest recorded. The larger fall from Sonnet 5's earlier $11.19 is prompt
caching, not the model. Sonnet 5.5 became the default in code, with Sonnet 5
kept as an option. The Evals page now plots pass rate, time per turn, cost
and cache share for every complete run over time.

## Limits

- **One attempt per case.** A pass means the case met its assertions once. It
  does not estimate production accuracy or performance on unseen language.
- **The judge shares a model family with the default.** Opus 5.5 may favour
  Sonnet 5's wording. Read the exact checks and made-up values first when
  comparing a Claude model with another family. Validating the judge against
  human labels is the open item.
- **The judge is fallible.** Earlier runs show it grading identical replies
  differently at low effort, and missing context it needed. Its verdicts are
  kept for human review, not treated as ground truth.
- **Published reports cannot be tied to an exact commit.** Source hashes stay
  local with the raw captures. Each report records the prompt version, model,
  effort, judge and rubric version.
- **Failures are kept.** History is append-only. Interrupted, partial and
  failed runs stay published and are listed on the Evals page with a reason.

## Published evidence

Reports keep scenarios, customer-visible replies, grading, timing, token usage
and judge audits. They exclude credentials, raw backend captures, source
hashes, request identifiers and private model thread identifiers.
`agent/published-eval-results/story.json` gives the Evals page its reading
order. A test fails if a published run has no place in it.

## Reproduce locally

```sh
cd agent
pnpm install --frozen-lockfile
pnpm test
pnpm run dashboard
```

The tests and the recorded dashboard need no API key. A paid held-out run needs
`OPENROUTER_API_KEY` and explicit caps, for example
`pnpm run eval:harden -- --live --max-cost=3 --max-calls=150`.
