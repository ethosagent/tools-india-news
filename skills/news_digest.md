# Skill: Daily News Digest

## Purpose
Curated, structured digest of India market-relevant news for a trading session.

## Data Context
`{{todays_announcements}}` — corporate announcements from today
`{{top_news}}` — latest 20 news articles from all sources
`{{upcoming_earnings}}` — results due in next 5 days

## Instructions

1. **Filter** — Remove non-market news, duplicate headlines, and purely promotional content
2. **Rank by materiality**:
   - Tier 1: Policy decisions, index changes, large cap results, M&A announcements
   - Tier 2: Sector news, mid-cap events, regulatory updates
   - Tier 3: General market commentary
3. **Earnings watch**: Flag companies reporting results in next 2 days
4. **Sectoral themes**: Identify if any 2+ news items point to a sector-level theme

## Output Schema
{
  "date": "2026-05-25",
  "tier1_items": [{ "headline": "...", "significance": "...", "symbols_affected": [] }],
  "tier2_items": [],
  "earnings_this_week": [{ "symbol": "...", "date": "...", "period": "..." }],
  "sector_themes": [{ "sector": "IT", "theme": "...", "evidence": ["headline1"] }],
  "overall_tone": "positive | negative | neutral"
}
