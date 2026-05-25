import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchRssFeed, parseRssXml } from '../rss-fetcher';

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Economic Times Markets</title>
    <item>
      <title><![CDATA[Nifty hits 25,000]]></title>
      <link>https://economictimes.com/markets/nifty-25000</link>
      <pubDate>Sun, 25 May 2026 08:00:00 +0530</pubDate>
      <description><![CDATA[<p>Markets rallied on strong FII inflows.</p>]]></description>
    </item>
    <item>
      <title>Simple title without CDATA</title>
      <link>https://economictimes.com/markets/simple</link>
      <pubDate>Sat, 24 May 2026 18:30:00 +0530</pubDate>
      <description><![CDATA[<div><b>Bold</b> and <i>italic</i> text</div>]]></description>
    </item>
  </channel>
</rss>`;

describe('parseRssXml', () => {
  it('parses RSS XML correctly', () => {
    const items = parseRssXml(RSS_FIXTURE, 'et');
    expect(items.length).toBe(2);
    expect(items[0].source).toBe('et');
    expect(items[0].title).toBe('Nifty hits 25,000');
    expect(items[0].url).toBe('https://economictimes.com/markets/nifty-25000');
  });

  it('strips HTML from description', () => {
    const items = parseRssXml(RSS_FIXTURE, 'et');
    expect(items[0].summary).toBe('Markets rallied on strong FII inflows.');
    expect(items[1].summary).toBe('Bold and italic text');
  });

  it('parses RFC 2822 dates', () => {
    const items = parseRssXml(RSS_FIXTURE, 'et');
    // pubDate: Sun, 25 May 2026 08:00:00 +0530
    const date = new Date(items[0].publishedAt);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(4); // May = 4
    expect(date.getDate()).toBe(25);
  });

  it('handles CDATA blocks', () => {
    const items = parseRssXml(RSS_FIXTURE, 'et');
    // First item uses CDATA for title
    expect(items[0].title).toBe('Nifty hits 25,000');
    // Second item does not use CDATA
    expect(items[1].title).toBe('Simple title without CDATA');
  });
});

describe('fetchRssFeed', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches and parses a feed', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response(RSS_FIXTURE, { status: 200 }));

    const items = await fetchRssFeed('et');
    expect(items.length).toBe(2);
    expect(items[0].source).toBe('et');
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
  });

  it('throws on HTTP error', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response('', { status: 500, statusText: 'Internal Server Error' })
    );

    await expect(fetchRssFeed('et')).rejects.toThrow('RSS fetch error (et): HTTP 500');
  });
});
