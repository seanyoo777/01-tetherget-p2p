# Contributing

## Branch & PR flow

1. Branch from `master` with a short descriptive name (example: `fix/catalog-metadata-parse`).
2. Open a PR into `master`.
3. Wait for **CI Release Gate** (`ci-gate.yml`) to pass: `npm run build` and `npm run verify:admin-smoke`.
4. Ensure branch protection rules require that check before merge (see `README.md`).
5. Merge only after review + green CI.

## Release checklist

Before merging anything that affects production behavior, follow `RELEASE_CHECKLIST.md`.

Minimum automated gate (also enforced in CI):

```bash
npm run release:check
```

## PR description

Include:

- **What** changed (one paragraph).
- **Why** (issue or operational need).
- **How tested** (commands run, manual scenarios if relevant).
- **Risk** (data migration, auth, admin-only paths).

## Review expectations

- Prefer small PRs; avoid unrelated refactors in the same PR.
- Security-sensitive paths (admin APIs, auth, finance): extra scrutiny.
- If touching DB schema or migrations: document rollback or recovery notes.

## Local commands

| Command | Purpose |
|--------|---------|
| `npm run dev:full` | API + Vite locally |
| `npm run release:check` | Server syntax + build + admin smoke (deploy/PR gate) |
| `npm run syntax:server` | `node --check server/index.js` |
| `npm run build` | Production bundle |
| `npm run verify:admin-smoke` | Admin regression scripts |

## Pull request template

New PRs use `.github/pull_request_template.md` automatically on GitHub.

## Questions

Open an issue or discuss in the PR; keep decisions recorded in the PR thread.
