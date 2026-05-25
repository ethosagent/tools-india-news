import type Database from 'better-sqlite3';

// -- Corporate announcements ---------------------------------------------------
// Stores BSE + NSE corporate filings. Deduplicated by (symbol, exchange, date, category).
export const SQL_CREATE_ANNOUNCEMENTS = `
  CREATE TABLE IF NOT EXISTS announcements (
    id           TEXT PRIMARY KEY,
    source       TEXT NOT NULL,
    symbol       TEXT,
    company_name TEXT,
    exchange     TEXT NOT NULL,
    date         TEXT NOT NULL,
    category     TEXT NOT NULL,
    headline     TEXT NOT NULL,
    detail       TEXT,
    attachment_url TEXT,
    scraped_at   INTEGER NOT NULL
  ) STRICT;
`;

export const SQL_CREATE_ANNOUNCEMENTS_IDX = `
  CREATE INDEX IF NOT EXISTS idx_announcements_symbol_date
  ON announcements (symbol, date DESC);
`;

export const SQL_CREATE_ANNOUNCEMENTS_FTS = `
  CREATE VIRTUAL TABLE IF NOT EXISTS announcements_fts
  USING fts5(headline, detail, content='announcements', content_rowid='rowid');
`;

// -- Earnings calendar ---------------------------------------------------------
export const SQL_CREATE_EARNINGS_CALENDAR = `
  CREATE TABLE IF NOT EXISTS earnings_calendar (
    symbol       TEXT NOT NULL,
    company_name TEXT NOT NULL,
    result_date  TEXT NOT NULL,
    period       TEXT,
    board_meeting_date TEXT,
    scraped_at   INTEGER NOT NULL,
    PRIMARY KEY (symbol, result_date)
  ) STRICT;
`;

// -- News articles -------------------------------------------------------------
export const SQL_CREATE_NEWS_ARTICLES = `
  CREATE TABLE IF NOT EXISTS news_articles (
    id           TEXT PRIMARY KEY,
    source       TEXT NOT NULL,
    title        TEXT NOT NULL,
    url          TEXT NOT NULL,
    published_at INTEGER NOT NULL,
    summary      TEXT,
    scraped_at   INTEGER NOT NULL
  ) STRICT;
`;

export const SQL_CREATE_NEWS_FTS = `
  CREATE VIRTUAL TABLE IF NOT EXISTS news_fts
  USING fts5(title, summary, content='news_articles', content_rowid='rowid');
`;

// -- Sync meta -----------------------------------------------------------------
export const SQL_CREATE_SYNC_META = `
  CREATE TABLE IF NOT EXISTS sync_meta (
    key         TEXT PRIMARY KEY,
    fetched_at  INTEGER NOT NULL,
    status      TEXT NOT NULL DEFAULT 'ok'
  ) STRICT;
`;

export function migrate(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SQL_CREATE_ANNOUNCEMENTS);
  db.exec(SQL_CREATE_ANNOUNCEMENTS_IDX);
  db.exec(SQL_CREATE_ANNOUNCEMENTS_FTS);
  db.exec(SQL_CREATE_EARNINGS_CALENDAR);
  db.exec(SQL_CREATE_NEWS_ARTICLES);
  db.exec(SQL_CREATE_NEWS_FTS);
  db.exec(SQL_CREATE_SYNC_META);
}
