# Guardrails

The agent uses layered controls. A prompt alone is treated as guidance, not a
security boundary.

| Layer | Control | Failure behavior |
|---|---|---|
| Capability | Four-tool allowlist with strict schemas | Reject any other action before execution |
| Scope | Search only, one way, one traveler, no payment or booking | Explain the limit and offer the next supported step |
| State | Latest explicit request wins over trip state and saved defaults | Preserve fields the traveler did not change |
| Data | Retrieved policy text and search responses are untrusted data | Validate them and never treat them as instructions |
| Grounding | Prices, routes, times and policy claims must come from a validated source | Reject corrupted results or use a support handoff |
| Conduct | Calm and professional even when the traveler is abusive | Never mirror profanity, insult, threaten, sexualize, discriminate or scold |
| Customer copy | Validate model-written clarification and policy text | Replace unsafe copy with a fixed redirect or support reply |
| Secrets | Redact credentials and personal identifiers from traces | Never expose keys, tokens, card-like values or internal prompts |
| Errors | Keep provider and backend detail in internal traces | Show a short recovery message without inventing availability |
| Cost | Session call limits, bounded context and explicit model selection | Stop cleanly when a limit is reached |
| Retries | Retry safe reads and one temporary model HTTP failure only | Never automatically retry an uncertain search creation |

User profanity does not block a legitimate flight request. The system separates
what the traveler is allowed to say from what the assistant is allowed to
return.

## What this does not claim

This is a prototype policy for a bounded search assistant. It does not yet use
a dedicated moderation classifier, a production abuse taxonomy, automated
human support routing, production identity controls or formal retention and
deletion workflows. Those controls should be designed with the operating team
before wider access or account actions are introduced.

Guardrail changes require deterministic tests and a bounded model regression.
The internal trace keeps the rejected reason so a safe customer reply does not
erase the evidence needed to debug the failure.
