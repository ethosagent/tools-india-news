// Ethos Tool wrappers for India news and corporate announcements
// @ethosagent/types is an optional peer dep — types re-declared locally to avoid hard import

import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fetchBseAnnouncements } from './bse-fetcher';
import { fetchNseAnnouncements, fetchNseEarningsCalendar } from './nse-fetcher';
import { fetchAllRssFeeds, fetchRssFeed } from './rss-fetcher';
import type { Announcement, EarningsEvent, NewsArticle } from './store';
import { NewsStore, TTL } from './store';

// ---------------------------------------------------------------------------
// Local type re-declarations (mirrors @ethosagent/types Tool interface)
// ---------------------------------------------------------------------------

type ToolResult = { ok: true; value: string } | { ok: false; error: string; code: string };

interface ToolContext {
  abortSignal?: AbortSignal;
  secretsResolver?: { get(ref: string): Promise<string | null> };
  scopedFetch?: { fetch(url: string, init?: RequestInit): Promise<Response> };
  emit?: (event: {
    type: 'progress';
    toolName: string;
    message: string;
    audience?: 'user' | 'internal';
    percent?: number;
  }) => void;
}

interface Tool {
  name: string;
  description: string;
  toolset: string;
  maxResultChars?: number;
  outputIsUntrusted?: boolean;
  capabilities?: {
    network?: { allowedHosts: string[] };
    secrets?: string[];
    fs?: { read?: string[]; write?: string[] };
  };
  isAvailable?(): boolean;
  schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

// ---------------------------------------------------------------------------
// Singleton store
// ---------------------------------------------------------------------------

let _store: NewsStore | null = null;

function getStore(): NewsStore {
  if (!_store) {
    const dbPath = process.env.INDIA_NEWS_DB ?? join(homedir(), '.ethos', 'news-data', 'news.db');
    _store = new NewsStore(dbPath);
  }
  return _store;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dedup(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

const CATEGORY_MAP: Record<string, string> = {
  results: 'Financial Results',
  dividend: 'Dividend',
  'board-meeting': 'Board Meeting',
  agm: 'AGM',
  acquisition: 'Acquisition',
  insider: 'Insider Trading',
};

async function refreshAnnouncements(
  store: NewsStore,
  opts?: { symbol?: string; force?: boolean }
): Promise<void> {
  const key = opts?.symbol ? `ann:${opts.symbol}` : 'ann:all';
  if (!opts?.force && !store.isStale(key, TTL.ANNOUNCEMENTS)) return;

  const [bseItems, nseItems] = await Promise.allSettled([
    fetchBseAnnouncements({ symbol: opts?.symbol }),
    fetchNseAnnouncements({ symbol: opts?.symbol }),
  ]);

  const announcements: Announcement[] = [];

  if (bseItems.status === 'fulfilled') {
    for (const item of bseItems.value) {
      announcements.push({
        id: dedup(`bse${item.symbol}${item.date}${item.headline}`),
        source: 'bse',
        symbol: item.symbol,
        companyName: item.companyName,
        exchange: 'BSE',
        date: item.date,
        category: item.category,
        headline: item.headline,
        detail: null,
        attachmentUrl: item.attachmentUrl,
        scrapedAt: Date.now(),
      });
    }
  }

  if (nseItems.status === 'fulfilled') {
    for (const item of nseItems.value) {
      announcements.push({
        id: dedup(`nse${item.symbol}${item.date}${item.headline}`),
        source: 'nse',
        symbol: item.symbol,
        companyName: item.companyName,
        exchange: 'NSE',
        date: item.date,
        category: item.category,
        headline: item.headline,
        detail: null,
        attachmentUrl: item.attachmentUrl,
        scrapedAt: Date.now(),
      });
    }
  }

  if (announcements.length > 0) {
    store.upsertAnnouncements(announcements);
  }
  store.setSyncMeta(key);
}

async function refreshEarnings(store: NewsStore, force = false): Promise<void> {
  if (!force && !store.isStale('earnings', TTL.EARNINGS_CAL)) return;

  const items = await fetchNseEarningsCalendar(30);
  const events: EarningsEvent[] = items.map((e) => ({
    symbol: e.symbol,
    companyName: e.companyName,
    resultDate: e.resultDate,
    period: e.period,
    boardMeetingDate: e.boardMeetingDate,
  }));

  if (events.length > 0) {
    store.upsertEarningsCalendar(events);
  }
  store.setSyncMeta('earnings');
}

async function refreshNews(
  store: NewsStore,
  opts?: { source?: 'et' | 'bs' | 'mc'; force?: boolean }
): Promise<void> {
  const key = opts?.source ? `news:${opts.source}` : 'news:all';
  if (!opts?.force && !store.isStale(key, TTL.NEWS_RSS)) return;

  const items =
    opts?.source && opts.source !== ('all' as string)
      ? await fetchRssFeed(opts.source)
      : await fetchAllRssFeeds();

  const articles: NewsArticle[] = items.map((item) => ({
    id: dedup(item.url),
    source: item.source,
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAt,
    summary: item.summary,
  }));

  if (articles.length > 0) {
    store.upsertNewsArticles(articles);
  }
  store.setSyncMeta(key);
}

// ---------------------------------------------------------------------------
// Per-tool arg interfaces
// ---------------------------------------------------------------------------

interface AnnouncementsArgs {
  symbol?: string;
  category?: string;
  days?: number;
  limit?: number;
  force_refresh?: boolean;
}

interface EarningsCalendarArgs {
  days?: number;
  symbol?: string;
}

interface NewsFeedArgs {
  source?: string;
  limit?: number;
  force_refresh?: boolean;
}

interface SearchArgs {
  query?: string;
  scope?: string;
  limit?: number;
}

interface BriefArgs {
  symbol?: string;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const indiaNewsAnnouncements: Tool = {
  name: 'india_news_announcements',
  description:
    'BSE and NSE corporate announcements for Indian listed companies.\n' +
    'Returns board meeting notices, financial results declarations, dividend announcements,\n' +
    'AGM notices, acquisition disclosures, and other regulatory filings.\n' +
    'Data is cached for 4 hours; pass force_refresh: true for real-time.\n' +
    'If symbol is provided, returns last 30 days of filings for that company.\n' +
    'If no symbol, returns latest 50 announcements across all categories.',
  toolset: 'news',
  maxResultChars: 8000,
  outputIsUntrusted: true,
  capabilities: {
    network: {
      allowedHosts: ['api.bseindia.com', 'www.bseindia.com', 'www.nseindia.com'],
    },
  },
  schema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description: 'NSE symbol (e.g. RELIANCE, TCS). Omit for all-market announcements.',
      },
      category: {
        type: 'string',
        enum: ['results', 'dividend', 'board-meeting', 'agm', 'acquisition', 'insider', 'all'],
        description: 'Filter by announcement category (default: all)',
      },
      days: {
        type: 'number',
        description: 'Look back N days (default 7, max 90)',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default 30, max 100)',
      },
      force_refresh: {
        type: 'boolean',
        description: 'Bypass 4h cache and fetch fresh from BSE/NSE (default false)',
      },
    },
  },
  async execute(rawArgs: Record<string, unknown>): Promise<ToolResult> {
    try {
      const args = rawArgs as AnnouncementsArgs;
      const store = getStore();
      await refreshAnnouncements(store, { symbol: args.symbol, force: args.force_refresh });

      const days = Math.min(args.days ?? 7, 90);
      const limit = Math.min(args.limit ?? 30, 100);

      let announcements: Announcement[];
      if (args.symbol) {
        announcements = store.getAnnouncementsForSymbol(args.symbol, days).slice(0, limit);
      } else if (args.category && args.category !== 'all') {
        const cat = CATEGORY_MAP[args.category] ?? args.category;
        announcements = store.getAnnouncementsByCategory(cat, days, limit);
      } else {
        announcements = store.getLatestAnnouncements(days, limit);
      }

      return {
        ok: true,
        value: JSON.stringify({
          fetched_at: new Date().toISOString(),
          count: announcements.length,
          announcements: announcements.map((a) => ({
            symbol: a.symbol,
            company: a.companyName,
            date: a.date,
            category: a.category,
            headline: a.headline,
            source: a.source,
            attachment_url: a.attachmentUrl,
          })),
        }),
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        code: 'FETCH_ERROR',
      };
    }
  },
};

const indiaNewsEarningsCalendar: Tool = {
  name: 'india_news_earnings_calendar',
  description:
    'Upcoming earnings result dates for NSE-listed companies.\n' +
    'Returns companies scheduled to announce quarterly/annual results in the next N days.\n' +
    "Sourced from NSE's official event calendar. Use before earnings season\n" +
    'to plan research agenda or set watchdog alerts.',
  toolset: 'news',
  maxResultChars: 5000,
  outputIsUntrusted: true,
  capabilities: {
    network: { allowedHosts: ['www.nseindia.com'] },
  },
  schema: {
    type: 'object',
    properties: {
      days: {
        type: 'number',
        description: 'Look ahead N days for upcoming results (default 14, max 30)',
      },
      symbol: {
        type: 'string',
        description: 'Filter to a specific symbol (optional)',
      },
    },
  },
  async execute(rawArgs: Record<string, unknown>): Promise<ToolResult> {
    try {
      const args = rawArgs as EarningsCalendarArgs;
      const store = getStore();
      await refreshEarnings(store);

      const days = Math.min(args.days ?? 14, 30);
      let results = store.getUpcomingEarnings(days);

      if (args.symbol) {
        const sym = args.symbol.toUpperCase();
        results = results.filter((e) => e.symbol === sym);
      }

      return {
        ok: true,
        value: JSON.stringify({
          as_of: new Date().toISOString().slice(0, 10),
          upcoming_count: results.length,
          results: results.map((e) => ({
            symbol: e.symbol,
            company: e.companyName,
            result_date: e.resultDate,
            period: e.period,
            board_meeting_date: e.boardMeetingDate,
          })),
        }),
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        code: 'FETCH_ERROR',
      };
    }
  },
};

const indiaNewsFeed: Tool = {
  name: 'india_news_feed',
  description:
    'Latest Indian financial news from Economic Times, Business Standard, and Moneycontrol.\n' +
    'Returns headlines, summaries, and URLs. Cache TTL is 1 hour.\n' +
    'Use for staying current on market-moving news. Content is from external sources —\n' +
    'headlines may contain promotional language; evaluate critically.',
  toolset: 'news',
  maxResultChars: 10000,
  outputIsUntrusted: true,
  capabilities: {
    network: {
      allowedHosts: [
        'economictimes.indiatimes.com',
        'www.business-standard.com',
        'www.moneycontrol.com',
      ],
    },
  },
  schema: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        enum: ['et', 'bs', 'mc', 'all'],
        description:
          'News source: Economic Times (et), Business Standard (bs), Moneycontrol (mc), or all (default)',
      },
      limit: {
        type: 'number',
        description: 'Max articles to return (default 15, max 50)',
      },
      force_refresh: {
        type: 'boolean',
        description: 'Bypass 1h cache (default false)',
      },
    },
  },
  async execute(rawArgs: Record<string, unknown>): Promise<ToolResult> {
    try {
      const args = rawArgs as NewsFeedArgs;
      const store = getStore();
      const src =
        args.source === 'all' || !args.source ? undefined : (args.source as 'et' | 'bs' | 'mc');
      await refreshNews(store, { source: src, force: args.force_refresh });

      const limit = Math.min(args.limit ?? 15, 50);
      const articles = store.getLatestNews(limit, src);

      return {
        ok: true,
        value: JSON.stringify({
          fetched_at: new Date().toISOString(),
          count: articles.length,
          articles: articles.map((a) => ({
            source: a.source,
            title: a.title,
            url: a.url,
            published_at: new Date(a.publishedAt).toISOString(),
            summary: a.summary,
          })),
        }),
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        code: 'FETCH_ERROR',
      };
    }
  },
};

const indiaNewsSearch: Tool = {
  name: 'india_news_search',
  description:
    'Full-text search across corporate announcements and news articles.\n' +
    'Uses SQLite FTS5 for fast keyword search over locally cached content.\n' +
    'Does NOT fetch new data — searches only the local cache (refresh first if needed).\n' +
    'Returns results ranked by relevance.',
  toolset: 'news',
  maxResultChars: 8000,
  outputIsUntrusted: true,
  capabilities: {},
  schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query. Supports FTS5 operators: "exact phrase", AND, OR, NOT.',
      },
      scope: {
        type: 'string',
        enum: ['announcements', 'news', 'all'],
        description: 'Which content to search (default: all)',
      },
      limit: {
        type: 'number',
        description: 'Max results per scope (default 10)',
      },
    },
    required: ['query'],
  },
  async execute(rawArgs: Record<string, unknown>): Promise<ToolResult> {
    try {
      const args = rawArgs as SearchArgs;
      const store = getStore();
      const limit = args.limit ?? 10;
      const scope = args.scope ?? 'all';

      const query = args.query ?? '';
      const annResults =
        scope === 'all' || scope === 'announcements' ? store.searchAnnouncements(query, limit) : [];
      const newsResults = scope === 'all' || scope === 'news' ? store.searchNews(query, limit) : [];

      return {
        ok: true,
        value: JSON.stringify({
          query,
          announcements: annResults.map((a) => ({
            symbol: a.symbol,
            company: a.companyName,
            date: a.date,
            category: a.category,
            headline: a.headline,
            source: a.source,
          })),
          news: newsResults.map((n) => ({
            source: n.source,
            title: n.title,
            url: n.url,
            published_at: new Date(n.publishedAt).toISOString(),
          })),
          total: annResults.length + newsResults.length,
        }),
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        code: 'FETCH_ERROR',
      };
    }
  },
};

const indiaNewsBrief: Tool = {
  name: 'india_news_brief',
  description:
    'Single-call news snapshot for a trading session.\n' +
    'Combines: (1) top corporate announcements from today, (2) upcoming earnings in next 7 days,\n' +
    '(3) latest news headlines from all sources.\n' +
    'Refreshes stale data automatically. Use for session-start context injection.',
  toolset: 'news',
  maxResultChars: 8000,
  outputIsUntrusted: true,
  capabilities: {
    network: {
      allowedHosts: [
        'api.bseindia.com',
        'www.bseindia.com',
        'www.nseindia.com',
        'economictimes.indiatimes.com',
        'www.business-standard.com',
        'www.moneycontrol.com',
      ],
    },
  },
  schema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description: 'Optional: filter announcements for a specific symbol',
      },
    },
  },
  async execute(rawArgs: Record<string, unknown>): Promise<ToolResult> {
    try {
      const args = rawArgs as BriefArgs;
      const store = getStore();

      // Refresh stale data
      await Promise.allSettled([
        refreshAnnouncements(store, { symbol: args.symbol }),
        refreshEarnings(store),
        refreshNews(store),
      ]);

      // Today's announcements
      let announcements: Announcement[];
      if (args.symbol) {
        announcements = store.getAnnouncementsForSymbol(args.symbol, 1);
      } else {
        announcements = store.getLatestAnnouncements(1, 20);
      }

      // Upcoming earnings (next 7 days)
      const earnings = store.getUpcomingEarnings(7);

      // Top news
      const news = store.getLatestNews(10);

      return {
        ok: true,
        value: JSON.stringify({
          as_of: new Date().toISOString(),
          todays_announcements: {
            count: announcements.length,
            items: announcements.map((a) => ({
              symbol: a.symbol,
              company: a.companyName,
              category: a.category,
              headline: a.headline,
              source: a.source,
            })),
          },
          upcoming_earnings: {
            count: earnings.length,
            items: earnings.map((e) => ({
              symbol: e.symbol,
              company: e.companyName,
              result_date: e.resultDate,
              period: e.period,
            })),
          },
          top_news: {
            count: news.length,
            items: news.map((n) => ({
              source: n.source,
              title: n.title,
              url: n.url,
            })),
          },
        }),
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        code: 'FETCH_ERROR',
      };
    }
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function activate(api: { registerTool(tool: unknown): void }): void {
  for (const tool of createIndiaNewsTools()) {
    api.registerTool(tool);
  }
}

export function createIndiaNewsTools(): Tool[] {
  return [
    indiaNewsAnnouncements,
    indiaNewsEarningsCalendar,
    indiaNewsFeed,
    indiaNewsSearch,
    indiaNewsBrief,
  ];
}
