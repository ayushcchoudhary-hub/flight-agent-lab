# Publication checklist

- [ ] Repository visibility is private until a deliberate review approves sharing
- [ ] `git status --ignored` confirms product repositories and runtime data are ignored
- [ ] No secret, token, credential, personal data or customer identifier is tracked
- [ ] No product source, internal documentation or generated source snapshot is tracked
- [ ] No raw staging capture, trace or model transcript is tracked
- [ ] Synthetic fixtures contain invented data and are labelled as synthetic
- [ ] README describes only the agent layer and public integration boundary
- [ ] A clean checkout installs, tests and builds without the product repository
- [ ] Live demo credentials are stored in the cloud secret manager, never in Git
- [ ] A human reviews the complete tracked-file list before granting repository access
