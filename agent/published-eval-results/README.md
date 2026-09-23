# Published evaluation evidence

These reports are generated from an explicit allowlist. They retain scenarios,
customer-facing replies, grading, timing, token usage and, for hardening runs,
the independent judge audit. Credentials, raw backend captures, source hashes,
request identifiers and private model thread identifiers are excluded.

Hardening history is deliberately append-only. The 42-case frozen baseline,
12-case correction run, five-case policy correction and three-case final policy
verification show the progression. A later targeted pass does not rewrite the
earlier failure or claim that the entire suite was rerun.

`story.json` gives the reading order shown on the Evals page. It names the
milestone runs and says in plain words what changed and why. It never types a
score: the page computes every number from the reports themselves. Runs that
are partial, split by a rate limit or targeted at a few cases are listed as
supporting evidence with a reason, not removed. A run finished in two parts
after a provider error is listed as both parts and shown as one run.
