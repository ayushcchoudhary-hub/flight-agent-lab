# Security and publication boundary

This repository is the independent agent layer. It is not a copy, fork or
partial export of the flight product.

## Allowed in this repository

- Agent orchestration, tool schemas and deterministic response rendering
- A narrow adapter contract for an externally supplied flight-search API
- Synthetic fixtures created for this project
- Prompt and behavior specifications
- Aggregate evaluation methods, sanitized results and selected customer-facing
  outputs that contain no private backend data
- Deployment files for the independent agent service

## Never allowed in this repository

- Product source code, internal documentation or generated copies of either
- Secrets, session tokens, credentials or authenticated response captures
- Customer data, account identifiers or private search history
- Raw production or staging logs
- Undocumented private endpoints or implementation details learned from the
  product repository
- Raw model transcripts or any transcript containing private backend responses

The local folders `reference/` and `flyai-agent-preferences/` are explicitly
ignored. The container build no longer imports from either folder. The agent
owns its adapter and validates the small response shape it consumes.

## Runtime trust boundary

The model proposes one structured action. Application code validates it,
executes an allowlisted operation and renders the customer response. The model
never receives credentials and cannot choose a host, URL or arbitrary request
field. Search creation is not automatically retried because a timeout can leave
the first request in an unknown state.

Before any repository is shared, run the publication audit and inspect the
tracked-file list. A private repository reduces exposure but does not relax
these rules.

## Hosted experiment limits

- The session token is derived from the shared experiment password. It remains
  valid until that password changes.
- Login throttling, active-session limits and message limits are held in one
  running instance. They do not coordinate across multiple instances and reset
  when the instance restarts.
- Keep the Cloud Run service at a maximum of one instance while these controls
  are in memory.
- Put a hard spending limit on the OpenRouter key. Application call limits
  reduce routine usage but are not a billing control.
- Anyone with the shared password can use the experiment allowance. Rotate the
  password after external demonstrations and before changing the audience.
