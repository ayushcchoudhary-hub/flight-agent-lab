# Claude Code instructions

@AGENTS.md
@HANDOFF.md

The imported handoff defines the current state, evidence limits, security
boundary, verification steps and next product decision.

Treat the tracked repository as the complete project boundary. Do not inspect,
copy or summarize ignored private product repositories, raw traces, credentials
or local reference material. Do not run paid evaluations or deploy unless the
user explicitly asks for that work and a bounded cost or call limit is clear.

For every change, be prepared to explain the user problem, the chosen fix, the
validation performed and any remaining limitation. Preserve historical failed
evidence and never claim the full hardening suite passed unless it is actually
rerun and recorded.
