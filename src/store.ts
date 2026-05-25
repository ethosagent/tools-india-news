import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { migrate } from './schema';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface Announcement {
  id: string;
  source: 'bse' | 'nse';
  symbol: string | null;
  companyName: string | null;
  exchange: string;
  date: string; // YYYY-MM-DD
  category: string;
  headline: string;
  detail: string | null;
  attachmentUrl: string | null;
  scrapedAt: number;
}

export interface EarningsEvent {
  symbol: string;
  companyName: string;
  resultDate: string; // YYYY-MM-DD
  period: string | null;
  boardMeetingDate: string | null;
}

export interface NewsArticle {
  id: string;
  source: 'et' | 'bs' | 'mc';
  title: string;
  url: string;
  publishedAt: number; // unix epoch ms
  summary: string | null;
}

export const TTL = {
  ANNOUNCEMENTS: 4 * 60 * 60 * 1000, // 4 hours
  EARNINGS_CAL: 24 * 60 * 60 * 1000, // 24 hours
  NEWS_RSS: 1 * 60 * 60 * 1000, // 1 hour
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dedup(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function daysAhead(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Row mapper helpers
// ---------------------------------------------------------------------------

interface AnnouncementRow {
  id: string;
  source: string;
  symbol: string | null;
  company_name: string | null;
  exchange: string;
  date: string;
  category: string;
  headline: string;
  detail: string | null;
  attachment_url: string | null;
  scraped_at: number;
}

function mapAnnouncement(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    source: row.source as 'bse' | 'nse',
    symbol: row.symbol,
    companyName: row.company_name,
    exchange: row.exchange,
    date: row.date,
    category: row.category,
    headline: row.headline,
    detail: row.detail,
    attachmentUrl: row.attachment_url,
    scrapedAt: row.scraped_at,
  };
}

interface EarningsRow {
  symbol: string;
  company_name: string;
  result_date: string;
  period: string | null;
  board_meeting_date: string | null;
}

function mapEarnings(row: EarningsRow): EarningsEvent {
  return {
    symbol: row.symbol,
    companyName: row.company_name,
    resultDate: row.result_date,
    period: row.period,
    boardMeetingDate: row.board_meeting_date,
  };
}

interface NewsRow {
  id: string;
  source: string;
  title: string;
  url: string;
  published_at: number;
  summary: string | null;
}

function mapNews(row: NewsRow): NewsArticle {
  return {
    id: row.id,
    source: row.source as 'et' | 'bs' | 'mc',
    title: row.title,
    url: row.url,
    publishedAt: row.published_at,
    summary: row.summary,
  };
}

// ---------------------------------------------------------------------------
// NewsStore
// ---------------------------------------------------------------------------

export class NewsStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    this.db = new Database(dbPath);
    migrate(this.db);
  }

  close(): void {
    this.db.close();
  }

  // -- Writers ---------------------------------------------------------------

  upsertAnnouncements(rows: Announcement[]): { inserted: number; skipped: number } {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO announcements
        (id, source, symbol, company_name, exchange, date, category, headline, detail, attachment_url, scraped_at)
      VALUES
        (@id, @source, @symbol, @companyName, @exchange, @date, @category, @headline, @detail, @attachmentUrl, @scrapedAt)
    `);
    const ftsStmt = this.db.prepare(`
      INSERT INTO announcements_fts (rowid, headline, detail)
      SELECT rowid, headline, detail FROM announcements WHERE id = @id
    `);

    let inserted = 0;
    let skipped = 0;

    const upsertMany = this.db.transaction((items: Announcement[]) => {
      for (const row of items) {
        const id = row.id || dedup(`${row.source}${row.symbol}${row.date}${row.headline}`);
        const info = stmt.run({
          id,
          source: row.source,
          symbol: row.symbol,
          companyName: row.companyName,
          exchange: row.exchange,
          date: row.date,
          category: row.category,
          headline: row.headline,
          detail: row.detail,
          attachmentUrl: row.attachmentUrl,
          scrapedAt: row.scrapedAt || Date.now(),
        });
        if (info.changes > 0) {
          inserted++;
          ftsStmt.run({ id });
        } else {
          skipped++;
        }
      }
    });

    upsertMany(rows);
    return { inserted, skipped };
  }

  upsertEarningsCalendar(rows: EarningsEvent[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO earnings_calendar
        (symbol, company_name, result_date, period, board_meeting_date, scraped_at)
      VALUES
        (@symbol, @companyName, @resultDate, @period, @boardMeetingDate, @scrapedAt)
    `);

    const upsertMany = this.db.transaction((items: EarningsEvent[]) => {
      for (const row of items) {
        stmt.run({
          symbol: row.symbol,
          companyName: row.companyName,
          resultDate: row.resultDate,
          period: row.period,
          boardMeetingDate: row.boardMeetingDate,
          scrapedAt: Date.now(),
        });
      }
    });

    upsertMany(rows);
  }

  upsertNewsArticles(rows: NewsArticle[]): { inserted: number; skipped: number } {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO news_articles
        (id, source, title, url, published_at, summary, scraped_at)
      VALUES
        (@id, @source, @title, @url, @publishedAt, @summary, @scrapedAt)
    `);
    const ftsStmt = this.db.prepare(`
      INSERT INTO news_fts (rowid, title, summary)
      SELECT rowid, title, summary FROM news_articles WHERE id = @id
    `);

    let inserted = 0;
    let skipped = 0;

    const upsertMany = this.db.transaction((items: NewsArticle[]) => {
      for (const row of items) {
        const id = row.id || dedup(row.url);
        const info = stmt.run({
          id,
          source: row.source,
          title: row.title,
          url: row.url,
          publishedAt: row.publishedAt,
          summary: row.summary,
          scrapedAt: row.publishedAt || Date.now(),
        });
        if (info.changes > 0) {
          inserted++;
          ftsStmt.run({ id });
        } else {
          skipped++;
        }
      }
    });

    upsertMany(rows);
    return { inserted, skipped };
  }

  setSyncMeta(key: string, status = 'ok'): void {
    this.db
      .prepare(`
      INSERT OR REPLACE INTO sync_meta (key, fetched_at, status) VALUES (?, ?, ?)
    `)
      .run(key, Date.now(), status);
  }

  // -- Readers ---------------------------------------------------------------

  getAnnouncementsForSymbol(symbol: string, days = 30): Announcement[] {
    const since = daysAgo(days);
    const rows = this.db
      .prepare(`
      SELECT * FROM announcements
      WHERE symbol = ? AND date >= ?
      ORDER BY date DESC
    `)
      .all(symbol.toUpperCase(), since) as AnnouncementRow[];
    return rows.map(mapAnnouncement);
  }

  getAnnouncementsByCategory(category: string, days = 7, limit = 50): Announcement[] {
    const since = daysAgo(days);
    const rows = this.db
      .prepare(`
      SELECT * FROM announcements
      WHERE category = ? AND date >= ?
      ORDER BY date DESC
      LIMIT ?
    `)
      .all(category, since, limit) as AnnouncementRow[];
    return rows.map(mapAnnouncement);
  }

  getLatestAnnouncements(days = 7, limit = 50): Announcement[] {
    const since = daysAgo(days);
    const rows = this.db
      .prepare(`
      SELECT * FROM announcements
      WHERE date >= ?
      ORDER BY date DESC
      LIMIT ?
    `)
      .all(since, limit) as AnnouncementRow[];
    return rows.map(mapAnnouncement);
  }

  searchAnnouncements(query: string, limit = 20): Announcement[] {
    const rows = this.db
      .prepare(`
      SELECT a.* FROM announcements a
      JOIN announcements_fts fts ON a.rowid = fts.rowid
      WHERE announcements_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `)
      .all(query, limit) as AnnouncementRow[];
    return rows.map(mapAnnouncement);
  }

  getUpcomingEarnings(days = 14): EarningsEvent[] {
    const todayStr = today();
    const untilStr = daysAhead(days);
    const rows = this.db
      .prepare(`
      SELECT * FROM earnings_calendar
      WHERE result_date >= ? AND result_date <= ?
      ORDER BY result_date ASC
    `)
      .all(todayStr, untilStr) as EarningsRow[];
    return rows.map(mapEarnings);
  }

  getLatestNews(limit = 20, source?: 'et' | 'bs' | 'mc'): NewsArticle[] {
    if (source) {
      const rows = this.db
        .prepare(`
        SELECT * FROM news_articles
        WHERE source = ?
        ORDER BY published_at DESC
        LIMIT ?
      `)
        .all(source, limit) as NewsRow[];
      return rows.map(mapNews);
    }
    const rows = this.db
      .prepare(`
      SELECT * FROM news_articles
      ORDER BY published_at DESC
      LIMIT ?
    `)
      .all(limit) as NewsRow[];
    return rows.map(mapNews);
  }

  searchNews(query: string, limit = 20): NewsArticle[] {
    const rows = this.db
      .prepare(`
      SELECT a.* FROM news_articles a
      JOIN news_fts fts ON a.rowid = fts.rowid
      WHERE news_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `)
      .all(query, limit) as NewsRow[];
    return rows.map(mapNews);
  }

  getSymbolFeed(
    symbol: string,
    days = 30
  ): Array<({ type: 'announcement' } & Announcement) | ({ type: 'news' } & NewsArticle)> {
    const announcements = this.getAnnouncementsForSymbol(symbol, days);
    const news = this.getLatestNews(50);
    // Filter news that mention the symbol in title or summary
    const sym = symbol.toUpperCase();
    const relevantNews = news.filter(
      (n) => n.title.toUpperCase().includes(sym) || n.summary?.toUpperCase().includes(sym)
    );

    const feed: Array<
      ({ type: 'announcement' } & Announcement) | ({ type: 'news' } & NewsArticle)
    > = [
      ...announcements.map((a) => ({ type: 'announcement' as const, ...a })),
      ...relevantNews.map((n) => ({ type: 'news' as const, ...n })),
    ];

    // Sort by date descending (use date for announcements, publishedAt for news)
    feed.sort((a, b) => {
      const dateA = a.type === 'announcement' ? new Date(a.date).getTime() : a.publishedAt;
      const dateB = b.type === 'announcement' ? new Date(b.date).getTime() : b.publishedAt;
      return dateB - dateA;
    });

    return feed;
  }

  // -- Staleness ---------------------------------------------------------------

  isStale(key: string, ttlMs: number): boolean {
    const row = this.db
      .prepare(`
      SELECT fetched_at FROM sync_meta WHERE key = ?
    `)
      .get(key) as { fetched_at: number } | undefined;
    if (!row) return true;
    return Date.now() - row.fetched_at > ttlMs;
  }

  getLastFetchedAt(key: string): number {
    const row = this.db
      .prepare(`
      SELECT fetched_at FROM sync_meta WHERE key = ?
    `)
      .get(key) as { fetched_at: number } | undefined;
    return row?.fetched_at ?? 0;
  }

  // -- Maintenance -------------------------------------------------------------

  clean(): { tablesCleared: string[] } {
    const tables = ['announcements', 'earnings_calendar', 'news_articles', 'sync_meta'];
    for (const table of tables) {
      this.db.exec(`DELETE FROM ${table}`);
    }
    // Rebuild FTS tables
    this.db.exec("INSERT INTO announcements_fts(announcements_fts) VALUES('rebuild')");
    this.db.exec("INSERT INTO news_fts(news_fts) VALUES('rebuild')");
    return { tablesCleared: tables };
  }
}
