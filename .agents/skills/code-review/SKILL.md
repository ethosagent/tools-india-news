---
name: code-review
description: |
  Code review guidelines for this tool package. Apply before declaring any implementation task done.
  Covers the self-review checklist and TypeScript-specific issues to catch.
---

# Code Review

## Self-review checklist (run before every task completion)

- [ ] `npm run check` passes (typecheck + lint + test)
- [ ] No `console.log` in library files (only `cli.ts` may log)
- [ ] All imports are extensionless (`./store` not `./store.ts`)
- [ ] No unused imports or variables (biome catches most, but check manually)
- [ ] New public methods have corresponding tests
- [ ] Tool `execute()` returns typed `ToolResult` — never throws, always catches

## TypeScript issues to catch

- `noUncheckedIndexedAccess` behavior — `array[i]` is `T | undefined`, not `T`. Guard before use.
- `better-sqlite3` rows are `unknown` when used — cast explicitly after validating shape
- Peer dependency `@ethosagent/types` is optional — `tools.ts` must not import it at the top level; use local type re-declarations
- Prefer `??` (nullish coalescing) over `||` for defaults — avoids falsy-value bugs with `0` or `""`
