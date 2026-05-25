import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Announcement, EarningsEvent, NewsArticle } from '../store';
import { NewsStore } from '../store';

describe('NewsStore', () => {
  let store: NewsStore;

  beforeEach(() => {
    store = new NewsStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  // -- Announcements ---------------------------------------------------------

  it('deduplicates announcements by id', () => {
    const ann: Announcement = {
      id: 'abc123',
      source: 'bse',
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries',
      exchange: 'BSE',
      date: '2026-05-22',
      category: 'Financial Results',
      headline: 'Q4 FY26 Results',
      detail: null,
      attachmentUrl: null,
      scrapedAt: Date.now(),
    };
    const r1 = store.upsertAnnouncements([ann]);
    const r2 = store.upsertAnnouncements([ann]);
    expect(r1.inserted).toBe(1);
    expect(r2.inserted).toBe(0);
    expect(r2.skipped).toBe(1);
  });

  it('getAnnouncementsForSymbol returns correct results', () => {
    const ann: Announcement = {
      id: 'test1',
      source: 'bse',
      symbol: 'INFY',
      companyName: 'Infosys',
      exchange: 'BSE',
      date: new Date().toISOString().slice(0, 10),
      category: 'Financial Results',
      headline: 'Q4 Results Announcement',
      detail: null,
      attachmentUrl: null,
      scrapedAt: Date.now(),
    };
    store.upsertAnnouncements([ann]);
    const results = store.getAnnouncementsForSymbol('INFY');
    expect(results.length).toBe(1);
    expect(results[0].symbol).toBe('INFY');
    expect(results[0].headline).toBe('Q4 Results Announcement');
  });

  it('getAnnouncementsByCategory filters correctly', () => {
    const today = new Date().toISOString().slice(0, 10);
    const announcements: Announcement[] = [
      {
        id: 'cat1',
        source: 'bse',
        symbol: 'TCS',
        companyName: 'TCS',
        exchange: 'BSE',
        date: today,
        category: 'Dividend',
        headline: 'Dividend announcement',
        detail: null,
        attachmentUrl: null,
        scrapedAt: Date.now(),
      },
      {
        id: 'cat2',
        source: 'nse',
        symbol: 'INFY',
        companyName: 'Infosys',
        exchange: 'NSE',
        date: today,
        category: 'Financial Results',
        headline: 'Q4 Results',
        detail: null,
        attachmentUrl: null,
        scrapedAt: Date.now(),
      },
    ];
    store.upsertAnnouncements(announcements);

    const dividends = store.getAnnouncementsByCategory('Dividend');
    expect(dividends.length).toBe(1);
    expect(dividends[0].symbol).toBe('TCS');

    const results = store.getAnnouncementsByCategory('Financial Results');
    expect(results.length).toBe(1);
    expect(results[0].symbol).toBe('INFY');
  });

  it('searchAnnouncements uses FTS5', () => {
    const today = new Date().toISOString().slice(0, 10);
    const ann: Announcement = {
      id: 'fts1',
      source: 'bse',
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries',
      exchange: 'BSE',
      date: today,
      category: 'Acquisition',
      headline: 'Reliance acquires controlling stake in media company',
      detail: 'The acquisition was completed for Rs 5000 crore',
      attachmentUrl: null,
      scrapedAt: Date.now(),
    };
    store.upsertAnnouncements([ann]);

    const results = store.searchAnnouncements('acquisition');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].headline).toContain('acquires');
  });

  // -- Staleness --------------------------------------------------------------

  it('isStale returns true when key never fetched', () => {
    expect(store.isStale('test-key', 60000)).toBe(true);
  });

  it('isStale returns false after setSyncMeta', () => {
    store.setSyncMeta('test-key');
    expect(store.isStale('test-key', 60000)).toBe(false);
  });

  // -- Earnings ---------------------------------------------------------------

  it('getUpcomingEarnings returns future dates', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const events: EarningsEvent[] = [
      {
        symbol: 'WIPRO',
        companyName: 'Wipro Limited',
        resultDate: tomorrowStr,
        period: 'Q4 FY26',
        boardMeetingDate: tomorrowStr,
      },
    ];
    store.upsertEarningsCalendar(events);

    const results = store.getUpcomingEarnings(7);
    expect(results.length).toBe(1);
    expect(results[0].symbol).toBe('WIPRO');
    expect(results[0].resultDate).toBe(tomorrowStr);
  });

  // -- News -------------------------------------------------------------------

  it('getLatestNews returns articles sorted by publishedAt', () => {
    const articles: NewsArticle[] = [
      {
        id: 'n1',
        source: 'et',
        title: 'Older article',
        url: 'https://example.com/1',
        publishedAt: Date.now() - 3600000,
        summary: null,
      },
      {
        id: 'n2',
        source: 'bs',
        title: 'Newer article',
        url: 'https://example.com/2',
        publishedAt: Date.now(),
        summary: 'Summary text',
      },
    ];
    store.upsertNewsArticles(articles);

    const results = store.getLatestNews(10);
    expect(results.length).toBe(2);
    expect(results[0].title).toBe('Newer article');
    expect(results[1].title).toBe('Older article');
  });

  it('getLatestNews filters by source', () => {
    const articles: NewsArticle[] = [
      {
        id: 'f1',
        source: 'et',
        title: 'ET article',
        url: 'https://et.com/1',
        publishedAt: Date.now(),
        summary: null,
      },
      {
        id: 'f2',
        source: 'mc',
        title: 'MC article',
        url: 'https://mc.com/1',
        publishedAt: Date.now(),
        summary: null,
      },
    ];
    store.upsertNewsArticles(articles);

    const etResults = store.getLatestNews(10, 'et');
    expect(etResults.length).toBe(1);
    expect(etResults[0].source).toBe('et');
  });

  // -- Clean ------------------------------------------------------------------

  it('clean() clears all tables', () => {
    const ann: Announcement = {
      id: 'clean1',
      source: 'bse',
      symbol: 'TEST',
      companyName: 'Test Co',
      exchange: 'BSE',
      date: new Date().toISOString().slice(0, 10),
      category: 'Other',
      headline: 'Test',
      detail: null,
      attachmentUrl: null,
      scrapedAt: Date.now(),
    };
    store.upsertAnnouncements([ann]);
    store.setSyncMeta('test');

    const result = store.clean();
    expect(result.tablesCleared).toContain('announcements');
    expect(result.tablesCleared).toContain('sync_meta');

    const results = store.getAnnouncementsForSymbol('TEST');
    expect(results.length).toBe(0);
    expect(store.isStale('test', 1)).toBe(true);
  });
});
