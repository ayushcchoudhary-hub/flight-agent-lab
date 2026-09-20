# Publication checklist

Reviewed 2026-09-20 against every tracked file and all commits on `main`.
Items marked open need a local shell and are completed by the repository
owner before visibility changes.

- [x] Repository visibility is private until a deliberate review approves sharing
- [ ] `git status --ignored` confirms product repositories and runtime data are ignored (open: owner, local shell)
- [x] No secret, token, credential, personal data or customer identifier is tracked (full-history review, 2026-09-20)
- [x] No product source, internal documentation or generated source snapshot is tracked (full-history review, 2026-09-20)
- [x] No raw staging capture, trace or model transcript is tracked. Published reports contain only the pinned search rows allowed by SECURITY-BOUNDARY.md
- [x] Synthetic fixtures contain invented data and are labelled as synthetic
- [x] README describes only the agent layer and public integration boundary
- [ ] A clean checkout installs, tests and builds without the product repository (open: owner, `pnpm install --frozen-lockfile && pnpm test`)
- [x] Live demo credentials are stored in the cloud secret manager, never in Git
- [x] A human reviews the complete tracked-file list before granting repository access (2026-09-20)
