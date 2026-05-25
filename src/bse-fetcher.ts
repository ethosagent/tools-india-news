const BSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; tools-india-news/1.0)',
  Accept: 'application/json',
  Origin: 'https://www.bseindia.com',
  Referer: 'https://www.bseindia.com/',
};

export const BSE_CATEGORY_CODES: Record<string, string> = {
  'Financial Results': '1',
  Dividend: '12',
  'Board Meeting': '2',
  AGM: '3',
  Acquisition: '28',
  'Insider Trading': '21',
  Demerger: '30',
  All: '-1',
};

export interface BseAnnouncement {
  symbol: string | null;
  companyName: string;
  date: string; // YYYY-MM-DD
  category: string;
  headline: string;
  attachmentUrl: string | null;
}

/** Parse BSE date format DD/MM/YYYY HH:MM:SS to YYYY-MM-DD */
function parseBseDate(dateStr: string): string {
  const parts = dateStr.split(' ')[0]?.split('/');
  if (!parts || parts.length !== 3) return dateStr;
  const [dd, mm, yyyy] = parts;
  return `${yyyy}-${mm}-${dd}`;
}

interface BseApiRow {
  SCRIP_CD?: string;
  SLONGNAME?: string;
  NEWS_DT?: string;
  CATEGORYNAME?: string;
  HEADLINE?: string;
  ATTACHMENTNAME?: string;
  NSURL?: string;
}

interface BseApiResponse {
  Table?: BseApiRow[];
}

export async function fetchBseAnnouncements(opts?: {
  symbol?: string;
  category?: string;
  fromDate?: string;
  toDate?: string;
}): Promise<BseAnnouncement[]> {
  const catCode = opts?.category ? (BSE_CATEGORY_CODES[opts.category] ?? '-1') : '-1';
  const scrip = opts?.symbol ?? '';

  let url =
    'https://api.bseindia.com/BseIndAPI/api/AnnGetData/w?' +
    `strCat=${catCode}&strType=C&strScrip=${scrip}`;

  if (opts?.fromDate) {
    // Convert YYYY-MM-DD to DD/MM/YYYY for BSE
    const [y, m, d] = opts.fromDate.split('-');
    url += `&strPrevDate=${d}/${m}/${y}`;
  }
  if (opts?.toDate) {
    const [y, m, d] = opts.toDate.split('-');
    url += `&strToDate=${d}/${m}/${y}`;
  }

  const res = await fetch(url, { headers: BSE_HEADERS });
  if (!res.ok) {
    throw new Error(`BSE API error: HTTP ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as BseApiResponse;
  const rows = data?.Table ?? [];

  return rows.map((r) => ({
    symbol: r.SCRIP_CD ?? null,
    companyName: r.SLONGNAME ?? '',
    date: r.NEWS_DT ? parseBseDate(r.NEWS_DT) : '',
    category: r.CATEGORYNAME ?? 'Other',
    headline: r.HEADLINE ?? '',
    attachmentUrl: r.ATTACHMENTNAME || r.NSURL || null,
  }));
}
