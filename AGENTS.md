# Agent Configuration

## What this repo is

A standalone npm package (`@ethosagent/tools-india-news`) providing Indian financial news and corporate announcements tools for Ethos AI agents. BSE/NSE filings, earnings calendar, and financial news RSS feeds cached in SQLite.

Read `CLAUDE.md` before writing any code.

## Mandatory first reads

Before writing any code, read:
1. `CLAUDE.md` — conventions, commands, domain knowledge, and gotchas
2. `src/` — current state of the implementation

## What agents are allowed to do

- Read any file in this repo
- Write and edit source files in `src/`
- Write and edit test files in `src/__tests__/`
- Run `npm run build`, `npm run test`, `npm run typecheck`, `npm run lint`, `npm run lint:fix`
- Run `git status`, `git diff`, `git log` (read-only git operations)
- Create feature branches

## What agents must NOT do without explicit user confirmation

- `git push` or `git push --tags`
- `npm publish`
- Delete files
- `git reset --hard`, `git checkout --`, force-push
- Modify `package.json` version field
- Modify `CHANGELOG.md` release entries

## Code review

After writing non-trivial code, do a self-review pass:
1. Check for unused imports, dead code, typos
2. Verify extensionless imports (`./store` not `./store.ts`)
3. Verify no `console.log` in library files (only `cli.ts`)
4. Verify `outputIsUntrusted: true` on all tools
5. Run `npm run check` — do not declare done until it passes

## Skills available

- `.agents/skills/code-review/` — code review guidelines
- `skills/earnings_preview.md` — pre-earnings analysis
- `skills/news_digest.md` — daily news digest
- `skills/announcement_triage.md` — announcement triage
