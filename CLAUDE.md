# tools-india-news

Indian financial news and corporate announcements tools for Ethos AI agents. Fetches BSE/NSE corporate announcements, earnings calendar, and financial news RSS feeds — cached in SQLite so agents always get structured, deduplicated data without redundant API calls.

Published to npm as `@ethosagent/tools-india-news`.

## Architecture

Five layers:
- `src/schema.ts` — SQL DDL + `migrate()` (no logic)
- `src/store.ts` — `NewsStore` class: all DB read/write (better-sqlite3)
- `src/bse-fetcher.ts` — BSE corporate announcements API
- `src/nse-fetcher.ts` — NSE corporate announcements + earnings calendar
- `src/rss-fetcher.ts` — RSS feed parser (Economic Times, Business Standard, Moneycontrol)
- `src/tools.ts` — Ethos `Tool[]` wrappers (5 tools)
- `src/cli.ts` — standalone CLI binary (`india-news`)
- `src/index.ts` — public barrel export

## Commands

```bash
npm install        # install deps
npm run build      # tsup → dist/
npm run test       # vitest run
npm run typecheck  # tsc --noEmit
npm run lint       # biome check .
npm run lint:fix   # biome check --write .
npm run check      # typecheck + lint + test (run before declaring done)
make help          # list all Makefile targets
```

## Sandbox

This repo lives at `/Users/mitesh/personal/sandbox/tools-india-news/` inside the sandbox shared directory. Edit files directly — no git, no worktrees. Use `npm run check` before declaring any task done.

## Conventions

- **Extensionless imports only**: `import './store'` not `import './store.ts'` or `import './store.js'`
- **No `console.log` in library code** — only `cli.ts` may log to stdout. All other files must be silent.
- **Tool results**: every `execute()` must return `{ ok: true; value: string }` or `{ ok: false; error: string; code: string }`
- **TypeScript strict mode** — `strict: true` in tsconfig.json, no `as any`
- **ESM only** — `"type": "module"` in package.json
- **Biome** — single quotes, 2-space indent, 100-char line width, trailing commas (es5), semicolons always
- **`outputIsUntrusted: true`** on all tools — content comes from external sources

## Domain

### Data sources

| Source | What | API Style | Auth |
|---|---|---|---|
| BSE India | Corporate announcements | REST JSON | None (public) |
| NSE India | Announcements + earnings calendar | REST JSON | Session cookie + browser headers |
| Economic Times | Financial news | RSS feed | None |
| Business Standard | Market + macro news | RSS feed | None |
| Moneycontrol | Retail-facing market news | RSS feed | None |

### BSE API

- Base: `https://api.bseindia.com/BseIndAPI/api`
- No auth required — just needs `Origin` + `Referer` headers
- Date format: `DD/MM/YYYY HH:MM:SS` — convert to `YYYY-MM-DD`
- Category codes: 1 = Financial Results, 12 = Dividend, 2 = Board Meeting, etc.

### NSE API

- Base: `https://www.nseindia.com/api`
- Requires session cookie from homepage (`GET https://www.nseindia.com/`)
- Cookie expires in ~5 minutes; module caches with 4-minute TTL
- Announcements: `GET /api/corporate-announcements?index=equities`
- Earnings: `GET /api/event-calendar` (filter for Financial Results / Quarterly Results)

### RSS feeds

- Manual XML parsing (no external dependency)
- Handles CDATA blocks in `<title>` and `<description>`
- Strips HTML from descriptions
- RFC 2822 date parsing via `new Date(pubDateStr).getTime()`

## Gotchas

- **`better-sqlite3` is synchronous** — never `await` inside `.run()`, `.prepare()`, or `.exec()`
- **NSE session cookie** — must GET homepage first, cookie valid ~5 min, cache in module-level var
- **Dedup logic** — `sha256(source + symbol + date + headline)` first 16 hex chars = announcement ID
- **Extensionless imports** — `moduleResolution: "bundler"` in tsconfig
- **STRICT SQLite tables** — column types enforced
- **`import.meta.dirname`** for path resolution (Node 24+)
- **`@ethosagent/types` is optional peer dep** — `tools.ts` re-declares types locally
- **TTLs**: announcements 4h, earnings calendar 24h, RSS news 1h
- **DB path**: `INDIA_NEWS_DB` env var, default `~/.ethos/news-data/news.db`

## Testing

- Run `npm run check` before declaring any task done
- Use `':memory:'` as SQLite path in tests
- Mock `globalThis.fetch` in fetcher tests — never hit real APIs in CI
- `parseRssXml` is exported for direct unit testing of the XML parser
