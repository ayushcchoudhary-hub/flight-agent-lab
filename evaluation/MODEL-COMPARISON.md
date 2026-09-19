# Model comparison protocol

## Question

Which model and reasoning setting meets the behavior contract with the best
observed latency and acceptable estimated cost?

## Controlled inputs

- The same 15 scenarios for every configuration
- A fixed test clock
- The same pinned staging-derived and synthetic flight fixtures
- A fresh conversation for each attempt
- Rotated configuration order between scenarios
- Application-owned defaults, validation and response formatting

The model interprets the request and proposes an action. It does not generate
the flight inventory or the formatted flight cards. This isolates the model
choice to the language-understanding task the model actually performs.

## Runs

The screening run evaluated Astra, Luna, Sol and Terra at low, medium and high
reasoning. All 12 configurations passed all 15 development scenarios once.

The follow-up run shortlisted Astra low, Luna low and Terra medium for five
planned repeats. It was intentionally stopped at the experiment budget. The
record contains 151 completed attempts, all of which passed. Seventy-four
planned attempts were never run and are not failures.

Terra medium had the fastest observed median in the shortlisted run at about
4.07 seconds per completed scenario. Luna low had a lower estimated token cost.
Terra medium was selected because the project prioritized the observed response
speed while retaining full correctness on completed development cases.

## Decision rule

1. **Correctness gate:** exclude configurations that do not pass every completed
   development check.
2. **Responsiveness:** compare median elapsed time and the middle 80 percent
   range. Faster typical replies matter in a conversational interface.
3. **Efficiency:** compare observed tokens and estimated API-equivalent cost per
   scenario. Cost is considered only after the correctness gate.
4. **Complexity:** prefer one stable default unless additional reasoning effort
   produces a measured benefit.

The full 12-configuration measurement table is in
[TEST-MATRIX.md](TEST-MATRIX.md). The interactive dashboard adds a speed-versus-
cost plot, latency ranges, token bars and scenario-level conversations. It also
preserves stopped and incomplete runs instead of hiding them.

## Interpretation limits

- These are development cases, not held-out tests.
- The repeated run did not finish the full plan.
- Provider load and caching affect latency.
- Dollar figures apply published token rates to observed usage. They are not
  the bill for the Codex subscription used to produce the run.
- A model passing these cases can still fail on unseen requests.

The appropriate next experiment is a small held-out set with new phrasings and
new edge cases. It is more informative than automatically running ten repeats
of every existing case.
