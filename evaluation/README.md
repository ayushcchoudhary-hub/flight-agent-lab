# Evaluation evidence

This folder explains how the agent was evaluated and what the results support.
It complements the interactive **Evals** and **Model comparison** pages in the
demo.

## Three evidence layers

1. **Deterministic checks** test application rules such as state merging,
   validation, endpoint restrictions, policy citation checks, response
   grounding and retry bounds. Run them with `cd agent && pnpm test`.
2. **Model acceptance cases** check whether a model converts natural language
   into the expected structured action across complete requests, missing
   information, follow-ups, ambiguity, unsupported requests and failures.
3. **Model comparisons** run the same scenarios and fixtures across model and
   reasoning configurations, recording correctness, elapsed time and tokens.

The current sanitized reports are under
[`agent/published-eval-results`](../agent/published-eval-results). They retain
test inputs, visible replies, grading, latency and token usage. They exclude
credentials, backend captures, source snapshots, request identifiers and
private model thread identifiers.

## What a pass means

A pass means the observed response satisfied the assertions written for that
case. It does not establish production accuracy, inventory correctness or
performance on unseen language. Many graders check structured state and tool
arguments. Some customer-copy checks use text patterns, so tone still requires
human review.

See [TEST-MATRIX.md](TEST-MATRIX.md) for coverage and
[MODEL-COMPARISON.md](MODEL-COMPARISON.md) for the experiment design and model
choice.
