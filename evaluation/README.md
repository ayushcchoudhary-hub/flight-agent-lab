# Evaluation evidence

This folder explains how the agent was evaluated and what the results support.
It complements the interactive **Evals** and **Model comparison** pages in the
demo.

[HARDENING.md](HARDENING.md) defines the next edge-case set, the limited role
of an LLM judge and the release rule for changing the default model.

## Three evidence layers

1. **Deterministic checks** test application rules such as state merging,
   validation, endpoint restrictions, policy citation checks, response
   grounding and retry bounds. Run them with `cd agent && pnpm test`.
2. **Model acceptance cases** check whether a model converts natural language
   into the expected structured action across complete requests, missing
   information, follow-ups, ambiguity, unsupported requests and failures.
3. **Model comparisons** run the same scenarios and fixtures across model and
   reasoning configurations, recording correctness, elapsed time and tokens.

The evaluation first screens DeepSeek, Mistral, Qwen and GLM with Terra medium
as the control. A later run repeats the finalists three times across all 15
cases. Provider fallback and model substitution remain disabled. Every paid run
has explicit application cost and call caps checked before each request.

The **Evals** page answers whether a preserved run met the behavior contract and
lets a reviewer inspect expected versus actual conversations. **Model
comparison** answers which configurations cleared that gate and how their
latency, token use and cost compared. Both are retained because they answer
different questions.

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

The generated [cost-versus-latency chart](openrouter-tradeoff.svg) is the static
GitHub view. The interactive dashboard includes the complete table, token view,
scenario matrix and underlying conversations.
