# tools-india-news

Indian financial news and corporate announcements for AI agents. Gives you structured, up-to-date data from Indian stock exchanges and financial news sites. All sources are free and require no API keys.

## Data sources

| Source | What you get |
|---|---|
| BSE India | Corporate announcements (results, dividends, AGM, acquisitions) |
| NSE India | Corporate announcements + earnings calendar |
| Economic Times | Financial news headlines |
| Business Standard | Market and macro news |
| Moneycontrol | Retail-focused market news |

## Available tools

| Tool | What it does |
|---|---|
| `india_news_announcements` | Get corporate announcements filtered by symbol, category, or time window |
| `india_news_earnings_calendar` | Get upcoming quarterly/annual earnings result dates |
| `india_news_feed` | Get latest financial news headlines from one or all RSS sources |
| `india_news_search` | Search across all cached announcements and news articles |
| `india_news_brief` | One-call snapshot: today's announcements, upcoming earnings, and top headlines |

## CLI quick start

```sh
# Get recent announcements for a specific company
india-news announcements --symbol RELIANCE

# See upcoming earnings dates for the next 14 days
india-news earnings

# Get the latest news from all sources
india-news feed

# Search for a topic across all cached data
india-news search "dividend"

# Get a full briefing for a symbol
india-news brief --symbol TCS
```

## Caching

Data is cached locally and refreshes automatically (announcements every 4 hours, news every hour, earnings calendar every 24 hours). Pass `--force-refresh` on any command to bypass the cache.
