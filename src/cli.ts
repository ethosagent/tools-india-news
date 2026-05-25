#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchBseAnnouncements } from './bse-fetcher';
import { fetchNseAnnouncements, fetchNseEarningsCalendar } from './nse-fetcher';
import { fetchAllRssFeeds, fetchRssFeed } from './rss-fetcher';
import type { Announcement, EarningsEvent, NewsArticle } from './store';
import { NewsStore, TTL } from './store';

function getPackageRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  return join(dirname(__filename), '..');
}

function getFlag(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}

function dedup(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function getStore(): NewsStore {
  const dbPath = process.env.INDIA_NEWS_DB ?? join(homedir(), '.ethos', 'news-data', 'news.db');
  return new NewsStore(dbPath);
}

const CATEGORY_MAP: Record<string, string> = {
  results: 'Financial Results',
  dividend: 'Dividend',
  'board-meeting': 'Board Meeting',
  agm: 'AGM',
  acquisition: 'Acquisition',
  insider: 'Insider Trading',
};

function printHelp(): void {
  console.log(`india-news — Indian financial news and corporate announcements CLI

Commands:
  announcements [--symbol SYM] [--category CAT] [--days N]
                                    List corporate announcements (default: all, last 7 days)
  earnings [--days N]               Upcoming earnings results (default: next 14 days)
  news [--source et|bs|mc|all] [--limit N]
                                    Latest financial news (default: all sources, 20 items)
  search <query>                    Full-text search across announcements + news
  refresh [--source KEY]            Force-refresh from APIs
  status                            Show cache staleness per source
  clean                             Wipe all cached data
  version                           Print version
  help                              Print this help

Environment:
  INDIA_NEWS_DB                     Path to SQLite database (default: ~/.ethos/news-data/news.db)

Examples:
  india-news announcements --symbol RELIANCE --days 30
  india-news earnings --days 7
  india-news news --source et --limit 10
  india-news search "Infosys acquisition"
`);
}

async function cmdAnnouncements(args: string[]): Promise<void> {
  const store = getStore();
  try {
    const symbol = getFlag(args, '--symbol');
    const categoryArg = getFlag(args, '--category');
    const daysArg = getFlag(args, '--days');
    const days = daysArg ? Number.parseInt(daysArg, 10) : 7;

    // Fetch fresh data if stale
    const key = symbol ? `ann:${symbol}` : 'ann:all';
    if (store.isStale(key, TTL.ANNOUNCEMENTS)) {
      console.log('Fetching fresh announcements...');
      const [bseItems, nseItems] = await Promise.allSettled([
        fetchBseAnnouncements({ symbol }),
        fetchNseAnnouncements({ symbol }),
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
      if (announcements.length > 0) store.upsertAnnouncements(announcements);
      store.setSyncMeta(key);
    }

    let results: Announcement[];
    if (symbol) {
      results = store.getAnnouncementsForSymbol(symbol, days);
    } else if (categoryArg && categoryArg !== 'all') {
      const cat = CATEGORY_MAP[categoryArg] ?? categoryArg;
      results = store.getAnnouncementsByCategory(cat, days);
    } else {
      results = store.getLatestAnnouncements(days);
    }

    if (results.length === 0) {
      console.log('No announcements found.');
      return;
    }

    console.log(`\n  Announcements (${results.length} results)\n`);
    for (const a of results) {
      console.log(`  ${a.date}  [${a.source.toUpperCase()}]  ${a.symbol ?? '???'}  ${a.category}`);
      console.log(`    ${a.headline}`);
      if (a.attachmentUrl) console.log(`    Link: ${a.attachmentUrl}`);
      console.log('');
    }
  } finally {
    store.close();
  }
}

async function cmdEarnings(args: string[]): Promise<void> {
  const store = getStore();
  try {
    const daysArg = getFlag(args, '--days');
    const days = daysArg ? Number.parseInt(daysArg, 10) : 14;

    if (store.isStale('earnings', TTL.EARNINGS_CAL)) {
      console.log('Fetching earnings calendar...');
      const items = await fetchNseEarningsCalendar(30);
      const events: EarningsEvent[] = items.map((e) => ({
        symbol: e.symbol,
        companyName: e.companyName,
        resultDate: e.resultDate,
        period: e.period,
        boardMeetingDate: e.boardMeetingDate,
      }));
      if (events.length > 0) store.upsertEarningsCalendar(events);
      store.setSyncMeta('earnings');
    }

    const results = store.getUpcomingEarnings(days);
    if (results.length === 0) {
      console.log('No upcoming earnings found.');
      return;
    }

    console.log(`\n  Upcoming Earnings (${results.length} results)\n`);
    for (const e of results) {
      console.log(`  ${e.resultDate}  ${e.symbol}  ${e.companyName}`);
      if (e.period) console.log(`    Period: ${e.period}`);
      console.log('');
    }
  } finally {
    store.close();
  }
}

async function cmdNews(args: string[]): Promise<void> {
  const store = getStore();
  try {
    const sourceArg = getFlag(args, '--source') as 'et' | 'bs' | 'mc' | 'all' | undefined;
    const limitArg = getFlag(args, '--limit');
    const limit = limitArg ? Number.parseInt(limitArg, 10) : 20;
    const src = sourceArg === 'all' || !sourceArg ? undefined : sourceArg;

    const key = src ? `news:${src}` : 'news:all';
    if (store.isStale(key, TTL.NEWS_RSS)) {
      console.log('Fetching news feeds...');
      const items = src ? await fetchRssFeed(src) : await fetchAllRssFeeds();
      const articles: NewsArticle[] = items.map((item) => ({
        id: dedup(item.url),
        source: item.source,
        title: item.title,
        url: item.url,
        publishedAt: item.publishedAt,
        summary: item.summary,
      }));
      if (articles.length > 0) store.upsertNewsArticles(articles);
      store.setSyncMeta(key);
    }

    const articles = store.getLatestNews(limit, src);
    if (articles.length === 0) {
      console.log('No news articles found.');
      return;
    }

    console.log(`\n  Latest News (${articles.length} articles)\n`);
    for (const a of articles) {
      const date = new Date(a.publishedAt).toISOString().slice(0, 16).replace('T', ' ');
      console.log(`  [${a.source.toUpperCase()}]  ${date}  ${a.title}`);
      if (a.summary)
        console.log(`    ${a.summary.slice(0, 120)}${a.summary.length > 120 ? '...' : ''}`);
      console.log(`    ${a.url}`);
      console.log('');
    }
  } finally {
    store.close();
  }
}

async function cmdSearch(args: string[]): Promise<void> {
  const store = getStore();
  try {
    const query = args.slice(1).join(' ');
    if (!query) {
      console.error('Usage: india-news search <query>');
      process.exit(1);
    }

    const announcements = store.searchAnnouncements(query);
    const news = store.searchNews(query);

    console.log(`\n  Search results for "${query}"\n`);

    if (announcements.length > 0) {
      console.log(`  Announcements (${announcements.length}):\n`);
      for (const a of announcements) {
        console.log(
          `    ${a.date}  [${a.source.toUpperCase()}]  ${a.symbol ?? '???'}  ${a.headline}`
        );
      }
      console.log('');
    }

    if (news.length > 0) {
      console.log(`  News (${news.length}):\n`);
      for (const n of news) {
        console.log(`    [${n.source.toUpperCase()}]  ${n.title}`);
        console.log(`    ${n.url}`);
      }
      console.log('');
    }

    if (announcements.length === 0 && news.length === 0) {
      console.log('  No results found. Try "india-news refresh" first to populate the cache.');
    }
  } finally {
    store.close();
  }
}

async function cmdRefresh(args: string[]): Promise<void> {
  const store = getStore();
  try {
    const sourceArg = getFlag(args, '--source');

    if (!sourceArg || sourceArg === 'announcements' || sourceArg === 'all') {
      console.log('Refreshing announcements...');
      const [bseItems, nseItems] = await Promise.allSettled([
        fetchBseAnnouncements(),
        fetchNseAnnouncements(),
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
        const r = store.upsertAnnouncements(announcements);
        console.log(`  Announcements: ${r.inserted} inserted, ${r.skipped} skipped`);
      }
      store.setSyncMeta('ann:all');
    }

    if (!sourceArg || sourceArg === 'earnings' || sourceArg === 'all') {
      console.log('Refreshing earnings calendar...');
      const items = await fetchNseEarningsCalendar(30);
      const events: EarningsEvent[] = items.map((e) => ({
        symbol: e.symbol,
        companyName: e.companyName,
        resultDate: e.resultDate,
        period: e.period,
        boardMeetingDate: e.boardMeetingDate,
      }));
      if (events.length > 0) store.upsertEarningsCalendar(events);
      console.log(`  Earnings: ${events.length} events`);
      store.setSyncMeta('earnings');
    }

    if (!sourceArg || sourceArg === 'news' || sourceArg === 'all') {
      console.log('Refreshing news feeds...');
      const items = await fetchAllRssFeeds();
      const articles: NewsArticle[] = items.map((item) => ({
        id: dedup(item.url),
        source: item.source,
        title: item.title,
        url: item.url,
        publishedAt: item.publishedAt,
        summary: item.summary,
      }));
      if (articles.length > 0) {
        const r = store.upsertNewsArticles(articles);
        console.log(`  News: ${r.inserted} inserted, ${r.skipped} skipped`);
      }
      store.setSyncMeta('news:all');
    }

    console.log('Refresh complete.');
  } finally {
    store.close();
  }
}

function cmdStatus(): void {
  const store = getStore();
  try {
    const keys = ['ann:all', 'earnings', 'news:all', 'news:et', 'news:bs', 'news:mc'];
    const ttls: Record<string, number> = {
      'ann:all': TTL.ANNOUNCEMENTS,
      earnings: TTL.EARNINGS_CAL,
      'news:all': TTL.NEWS_RSS,
      'news:et': TTL.NEWS_RSS,
      'news:bs': TTL.NEWS_RSS,
      'news:mc': TTL.NEWS_RSS,
    };

    console.log('\n  Cache Status\n');
    for (const key of keys) {
      const fetchedAt = store.getLastFetchedAt(key);
      const ttl = ttls[key] ?? TTL.NEWS_RSS;
      const stale = store.isStale(key, ttl);
      const lastStr = fetchedAt
        ? new Date(fetchedAt).toISOString().slice(0, 19).replace('T', ' ')
        : 'never';
      console.log(`  ${key.padEnd(12)} Last: ${lastStr}  ${stale ? '[STALE]' : '[fresh]'}`);
    }
    console.log('');
  } finally {
    store.close();
  }
}

function cmdClean(): void {
  const store = getStore();
  try {
    const result = store.clean();
    console.log(`Cleared tables: ${result.tablesCleared.join(', ')}`);
  } finally {
    store.close();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    printHelp();
    return;
  }

  if (command === 'version') {
    const pkgPath = join(getPackageRoot(), 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    console.log(pkg.version);
    return;
  }

  if (command === 'announcements') {
    await cmdAnnouncements(args);
    return;
  }

  if (command === 'earnings') {
    await cmdEarnings(args);
    return;
  }

  if (command === 'news') {
    await cmdNews(args);
    return;
  }

  if (command === 'search') {
    await cmdSearch(args);
    return;
  }

  if (command === 'refresh') {
    await cmdRefresh(args);
    return;
  }

  if (command === 'status') {
    cmdStatus();
    return;
  }

  if (command === 'clean') {
    cmdClean();
    return;
  }

  console.error(`Unknown command: ${command}\nRun "india-news help" for usage.`);
  process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
