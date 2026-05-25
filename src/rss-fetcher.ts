const RSS_SOURCES = {
  et: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms',
  bs: 'https://www.business-standard.com/rss/markets-106.rss',
  mc: 'https://www.moneycontrol.com/rss/latestnews.xml',
} as const;

export type RssSource = keyof typeof RSS_SOURCES;

export interface RssItem {
  source: RssSource;
  title: string;
  url: string;
  publishedAt: number; // unix epoch ms
  summary: string | null;
}

/** Extract text content from between XML tags, handling CDATA */
function extractTag(xml: string, tag: string): string {
  const openTag = `<${tag}`;
  const closeTag = `</${tag}>`;
  const start = xml.indexOf(openTag);
  if (start === -1) return '';

  // Find the end of the opening tag (handle attributes)
  const tagEnd = xml.indexOf('>', start);
  if (tagEnd === -1) return '';

  const end = xml.indexOf(closeTag, tagEnd);
  if (end === -1) return '';

  let content = xml.slice(tagEnd + 1, end);

  // Handle CDATA
  const cdataStart = content.indexOf('<![CDATA[');
  if (cdataStart !== -1) {
    const cdataEnd = content.indexOf(']]>', cdataStart);
    if (cdataEnd !== -1) {
      content = content.slice(cdataStart + 9, cdataEnd);
    }
  }

  return content.trim();
}

/** Strip HTML tags from a string */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

/** Parse RSS XML into RssItem[] */
export function parseRssXml(xml: string, source: RssSource): RssItem[] {
  const items: RssItem[] = [];

  // Split on <item> blocks
  const parts = xml.split('<item>');
  // Skip the first part (everything before the first <item>)
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];
    const itemEnd = block.indexOf('</item>');
    const itemXml = itemEnd !== -1 ? block.slice(0, itemEnd) : block;

    const title = extractTag(itemXml, 'title');
    const link = extractTag(itemXml, 'link');
    const pubDate = extractTag(itemXml, 'pubDate');
    const description = extractTag(itemXml, 'description');

    if (!title && !link) continue;

    const publishedAt = pubDate ? new Date(pubDate).getTime() : Date.now();

    items.push({
      source,
      title: stripHtml(title),
      url: link,
      publishedAt: Number.isNaN(publishedAt) ? Date.now() : publishedAt,
      summary: description ? stripHtml(description) || null : null,
    });
  }

  return items;
}

/** Fetch and parse a single RSS feed */
export async function fetchRssFeed(source: RssSource): Promise<RssItem[]> {
  const url = RSS_SOURCES[source];
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; tools-india-news/1.0)',
      Accept: 'application/rss+xml, application/xml, text/xml',
    },
  });
  if (!res.ok) {
    throw new Error(`RSS fetch error (${source}): HTTP ${res.status}`);
  }
  const xml = await res.text();
  return parseRssXml(xml, source);
}

/** Fetch all three RSS feeds in parallel */
export async function fetchAllRssFeeds(): Promise<RssItem[]> {
  const sources: RssSource[] = ['et', 'bs', 'mc'];
  const results = await Promise.allSettled(sources.map((s) => fetchRssFeed(s)));

  const items: RssItem[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    }
  }

  // Sort by publishedAt descending
  items.sort((a, b) => b.publishedAt - a.publishedAt);
  return items;
}
