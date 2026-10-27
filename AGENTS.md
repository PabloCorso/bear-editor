When adding or changing a keyboard shortcut, document it in the keyboard
shortcuts dialog so users can discover it.

When writing user-facing interface copy, follow
[`docs/interface-copy.md`](docs/interface-copy.md).

Never create test files unless explicitly requested by a human.

## Agent skills

### Issue tracker

Issues are tracked in this repo's GitHub Issues via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The repo uses the default five triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This repo is configured as single-context: one root `CONTEXT.md` and one root `docs/adr/`. See `docs/agents/domain.md`.
