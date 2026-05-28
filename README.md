# @ethosagent/tools-india-news

Indian financial news and corporate announcements tools for Ethos AI agents -- BSE/NSE filings, earnings calendar, and financial news RSS feeds cached in SQLite.

> **Part of the [Ethos](https://github.com/ethosagent/ethos) AI agent ecosystem.**
> These tools are designed to be registered with an Ethos agent via `createIndiaNewsTools()`. They can also be used standalone via the CLI.

## Install

```bash
npm install @ethosagent/tools-india-news
```

## Local storage

All fetched data is cached in SQLite at `~/.ethos/news-data/news.db` (override: `INDIA_NEWS_DB` env var). Nothing leaves your machine — no cloud sync, no external database.

| Data | Cache TTL | Stale-refresh trigger |
|---|---|---|
| BSE/NSE corporate announcements | 4 hours | Next call after TTL expires |
| Earnings calendar | 24 hours | Next call after TTL expires |
| News RSS feeds (ET, BS, MC) | 1 hour | Next call after TTL expires |

Data refreshes automatically when stale. To force an immediate refresh: `india-news refresh` (CLI) or ask your agent to call `india_news_refresh`. To wipe all cached data: `india-news clean`.

## CLI Usage

```bash
# Corporate announcements
india-news announcements --symbol RELIANCE --days 30
india-news announcements --category results --days 7

# Earnings calendar
india-news earnings --days 7

# Financial news
india-news news --source et --limit 10
india-news news --source all

# Full-text search
india-news search "Infosys acquisition"

# Cache management
india-news refresh
india-news status
india-news clean

# Version and help
india-news version
india-news help
```

### Environment

```bash
INDIA_NEWS_DB=~/.ethos/news-data/news.db  # SQLite database path (default)
```

## Library Usage

```typescript
import { NewsStore, createIndiaNewsTools } from '@ethosagent/tools-india-news';

// Use the store directly
const store = new NewsStore('~/.ethos/news-data/news.db');
const announcements = store.getAnnouncementsForSymbol('RELIANCE', 30);
store.close();
```

## Ethos Integration

```typescript
import { createIndiaNewsTools } from '@ethosagent/tools-india-news';

for (const tool of createIndiaNewsTools()) {
  toolRegistry.register(tool);
}
```

## First-time setup

After the plugin is installed, tell your agent:

> Refresh my India news data and give me a brief of the latest financial headlines

This seeds the local SQLite cache from BSE, NSE, and the news RSS feeds (Economic Times, Business Standard, Moneycontrol).

## Data Sources

| Source | What | Auth |
|---|---|---|
| BSE India | Corporate announcements (results, dividends, AGM, acquisitions) | None (public) |
| NSE India | Corporate announcements + earnings calendar | Session cookie (automatic) |
| Economic Times | Financial news (RSS) | None |
| Business Standard | Market + macro news (RSS) | None |
| Moneycontrol | Retail-facing market news (RSS) | None |

## Tools

| Tool | Description |
|---|---|
| `india_news_announcements` | BSE/NSE corporate announcements |
| `india_news_earnings_calendar` | Upcoming earnings result dates |
| `india_news_feed` | Latest financial news from ET, BS, MC |
| `india_news_search` | Full-text search over cached content |
| `india_news_brief` | Single-call session-start news snapshot |

## Development

```bash
npm install          # install dependencies
npm run check        # typecheck + lint + test
npm run build        # tsup -> dist/
npm run dev          # tsup --watch
make help            # list all Makefile targets
```

## Release

```bash
make version-bump-patch   # bump version
# update CHANGELOG.md
git add package.json CHANGELOG.md
git commit -m "chore: release v$(make version)"
git push origin main
# then: GitHub -> Actions -> Release -> Run workflow
make smoke                # verify on npm
```

## License

MIT
