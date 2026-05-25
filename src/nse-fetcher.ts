const NSE_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.nseindia.com/',
  'X-Requested-With': 'XMLHttpRequest',
};

let nseSessionCookie: string | null = null;
let nseSessionExpiry = 0;
const NSE_COOKIE_TTL_MS = 4 * 60 * 1000; // 4 minutes

async function ensureNseSession(): Promise<void> {
  const now = Date.now();
  if (nseSessionCookie && now < nseSessionExpiry) return;

  const res = await fetch('https://www.nseindia.com/', {
    headers: NSE_HEADERS,
  });
  if (!res.ok) {
    throw new Error(`NSE session fetch failed: HTTP ${res.status}`);
  }
  const setCookie = res.headers.getSetCookie?.() ?? [];
  nseSessionCookie = setCookie.map((c: string) => c.split(';')[0]).join('; ');
  nseSessionExpiry = now + NSE_COOKIE_TTL_MS;
}

async function nseGet(url: string): Promise<unknown> {
  await ensureNseSession();
  const res = await fetch(url, {
    headers: { ...NSE_HEADERS, Cookie: nseSessionCookie ?? '' },
  });
  if (!res.ok) {
    throw new Error(`NSE API error: HTTP ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export interface NseAnnouncement {
  symbol: string;
  companyName: string;
  date: string; // YYYY-MM-DD
  category: string;
  headline: string;
  attachmentUrl: string | null;
}

interface NseAnnouncementApiRow {
  symbol?: string;
  sm_name?: string;
  desc?: string;
  subject?: string;
  attchmntFile?: string;
  attchmntText?: string;
  an_dt?: string;
  exchdissTime?: string;
}

function parseNseDate(dateStr: string): string {
  // NSE dates can come in various formats; try ISO first, then DD-Mon-YYYY
  const d = new Date(dateStr);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return dateStr;
}

export async function fetchNseAnnouncements(opts?: {
  symbol?: string;
  fromDate?: string;
  toDate?: string;
}): Promise<NseAnnouncement[]> {
  let url = 'https://www.nseindia.com/api/corporate-announcements?index=equities';
  if (opts?.symbol) {
    url = `https://www.nseindia.com/api/corporate-announcements?index=equities&symbol=${encodeURIComponent(opts.symbol)}`;
  }

  const data = (await nseGet(url)) as NseAnnouncementApiRow[];
  const rows = Array.isArray(data) ? data : [];

  return rows.map((r) => ({
    symbol: r.symbol ?? '',
    companyName: r.sm_name ?? '',
    date: r.an_dt ? parseNseDate(r.an_dt) : r.exchdissTime ? parseNseDate(r.exchdissTime) : '',
    category: r.subject ?? 'Other',
    headline: r.desc ?? r.subject ?? '',
    attachmentUrl: r.attchmntFile || null,
  }));
}

// ---------------------------------------------------------------------------
// Earnings calendar
// ---------------------------------------------------------------------------

export interface NseEarningsEvent {
  symbol: string;
  companyName: string;
  resultDate: string; // YYYY-MM-DD
  period: string | null;
  boardMeetingDate: string | null;
}

interface NseEventCalendarRow {
  symbol?: string;
  company?: string;
  purpose?: string;
  bm_desc?: string;
  date?: string;
  bDT?: string;
}

export async function fetchNseEarningsCalendar(days = 14): Promise<NseEarningsEvent[]> {
  const data = (await nseGet('https://www.nseindia.com/api/event-calendar')) as
    | NseEventCalendarRow[]
    | undefined;
  const rows = Array.isArray(data) ? data : [];

  const now = new Date();
  const until = new Date();
  until.setDate(until.getDate() + days);

  return rows
    .filter(
      (r) =>
        r.purpose &&
        (r.purpose.includes('Financial Results') || r.purpose.includes('Quarterly Results'))
    )
    .map((r) => {
      const dateStr = r.date || r.bDT || '';
      return {
        symbol: r.symbol ?? '',
        companyName: r.company ?? '',
        resultDate: dateStr ? parseNseDate(dateStr) : '',
        period: r.bm_desc ?? null,
        boardMeetingDate: r.bDT ? parseNseDate(r.bDT) : null,
      };
    })
    .filter((e) => {
      const d = new Date(e.resultDate);
      return d >= now && d <= until;
    });
}
