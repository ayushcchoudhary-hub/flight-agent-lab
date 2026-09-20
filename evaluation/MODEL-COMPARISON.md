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

The later OpenRouter screen compared Terra medium with nine open-weight model
and effort configurations. It used one attempt per scenario and a four-case
smoke gate. Terra medium, DeepSeek V4.1 Flash low and GLM 5.3 high passed all 15
cases. GLM high had the fastest median at 1.40 seconds. DeepSeek low followed at
1.45 seconds and had the lowest observed cost at $0.00018 per scenario. It is
the strongest candidate for repeated validation.

The three-repeat validation initially exposed consistent date omission by
DeepSeek, one unsupported-request mistake by GLM and temporary provider errors.
The agent contract was clarified and the harness began enforcing two facts it
can verify without model judgment: one explicit ISO date must survive into the
search action, and a follow-up cannot change fields the traveler did not
mention. This is a model-agnostic reliability layer, not a model-specific test
answer.

After those changes, DeepSeek low passed 45 of 45 attempts in two full runs. In
the final Terra-versus-DeepSeek run, DeepSeek's median was 1.84 seconds and
Terra's was 1.80 seconds, so the early apparent four-times speed advantage did
not reproduce. DeepSeek's observed mean request cost was about $0.000108 per
scenario. Terra had two unreadable provider responses and completed 43 of 45.
The hosted experiment therefore defaults to DeepSeek low while retaining Terra
and GLM as selectable controls. This is a lab decision. Held-out requests are
still required before a production recommendation.

The historical Codex and current OpenRouter measurements use different serving
paths and prompt wrappers. The combined dashboard labels that distinction.
Cross-path latency is directional and must not be presented as a controlled
model-only comparison.

## Adjustments for open-weight models

Open-weight models do not require a separate agent architecture, but their tool
behavior must be measured directly. The
[Berkeley Function Calling Leaderboard](https://gorilla.cs.berkeley.edu/leaderboard)
distinguishes native function-calling support from prompt-based workarounds and
evaluates single-turn, relevance and multi-turn behavior separately. Its
published work also shows that an open model trained for function calling can
match proprietary models on bounded tool tasks.

Model-native formatting matters. DeepSeek's
[reference encoder](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/main/encoding/README.md)
defines its own tool-call and reasoning representation. GLM's
[model card](https://huggingface.co/zai-org/GLM-5.3) includes its native chat
template. The experiment therefore uses explicit model IDs, requires tool
parameter support, disables silent provider substitution and records the actual
provider returned for each request.

The observed failures supported a hybrid fix rather than a frontier-only rule.
The prompt now states the action checklist more directly. The harness enforces
facts that are cheap and safe to verify, such as preserving an explicit ISO
date and rejecting unmentioned follow-up changes. We still evaluate full
conversations because schema-valid JSON alone does not establish correct tool
selection or state handling.

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
- OpenRouter screening used one attempt per case and finalist validation used
  three. Provider names and request costs were recorded, fallbacks were
  disabled, and missing usage was reserved conservatively rather than treated
  as free.

The appropriate next experiment is a small held-out set with new phrasings and
new edge cases. It is more informative than automatically running ten repeats
of every existing development case.
