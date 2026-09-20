# Publication checklist

Reviewed 2026-09-20 against every tracked file and every commit in history.

- [x] Repository visibility stayed private until this review approved sharing
- [x] Product repositories and runtime data stay out of the repository.
      Verified directly against every tracked file and every commit, rather
      than by running `git status --ignored` in one working copy. A fresh
      clone holds none of the ignored folders, so the local command could
      not have tested them
- [x] No secret, token, credential, personal data or customer identifier is tracked (full-history review, 2026-09-20)
- [x] No product source, internal documentation or generated source snapshot is tracked (full-history review, 2026-09-20)
- [x] No raw staging capture, trace or model transcript is tracked. Published reports contain only the pinned search rows allowed by SECURITY-BOUNDARY.md
- [x] Synthetic fixtures contain invented data and are labelled as synthetic
- [x] README describes only the agent layer and public integration boundary
- [x] A clean checkout installs, tests and builds without the product
      repository. Proven by the CI workflow added in `7217f1f`, which
      installs from the committed lockfile and runs the deterministic suite
      on a fresh runner for every push
- [x] Live demo credentials are stored in the cloud secret manager, never in Git
- [x] A human reviews the complete tracked-file list before granting repository access (2026-09-20)

The repository carries no reuse license. See [LICENSE](LICENSE).
