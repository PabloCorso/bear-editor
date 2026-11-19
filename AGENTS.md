When adding or changing a keyboard shortcut, document it in the keyboard
shortcuts dialog so users can discover it.

When writing user-facing interface copy, follow
[`docs/interface-copy.md`](docs/interface-copy.md).

Never create test files unless explicitly requested by a human.

## Skill configuration

This side project does not use an issue tracker for planning. Use
[`ROADMAP.md`](ROADMAP.md), the user prompt, and the current branch or pull
request as specification sources. Never create or publish issues or tickets
unless explicitly requested by a human.

Domain language lives in the root `GLOSSARY.md`. Update it only when a concrete
term needs to be shared across the project. Keep implementation decisions in
code rather than creating architectural decision records.

## Desktop releases

Desktop releases are intentional and are not required for every change. When
changes are ready to reach installed desktop users, ask the human whether to
publish a desktop release. Never publish one without explicit approval.

After approval, run `npm run desktop:release -- patch` (or `minor`/`major`) on a
clean branch. This bumps `desktop/package.json` and `desktop/package-lock.json`,
creates the version commit, and creates the matching `v<version>` tag. Push the
commit and tag with `git push --follow-tags` to start the public GitHub release
workflow.

## Verification

Use proportional verification. Do not run checks for read-only work, and do not
rerun a check when nothing relevant has changed since it passed.

- For documentation or copy-only changes, run Prettier only on the changed
  files.
- For ordinary code changes, run Prettier and ESLint on the changed files, run
  the relevant existing Vitest tests, and run `npm run typecheck` once before
  handoff when TypeScript behavior or types changed.
- Run the full `npm run validate` suite for cross-cutting changes, dependency or
  tooling changes, broad refactors, or when a human explicitly requests it.

Prefer targeted commands such as `npx prettier <files> --check`,
`npx eslint <files>`, and `npx vitest run <test-files>` during the inner loop.
