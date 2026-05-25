# Skill: Earnings Preview

## Purpose
Structured pre-earnings analysis for an Indian listed company using upcoming result context.

## Data Context
`{{company_announcements}}` — last 60 days of BSE/NSE announcements for the company
`{{upcoming_result_date}}` — result date + period from earnings calendar
`{{recent_news}}` — news articles mentioning the company in last 14 days

## Instructions

1. **Result date & period**: Confirm result date and which quarter is being reported
2. **Last quarter recap**: Summarize the last quarterly result from announcements (PAT, revenue trend, guidance)
3. **Management signals**: Any promoter buying/selling, bulk deals, investor day comments in news
4. **Analyst estimates context**: Search news for analyst estimate mentions
5. **Key metrics to watch**: Based on the sector, identify the 3 most important metrics
6. **Risks**: Any negative news in last 30 days that could affect results

## Output Schema
{
  "symbol": "INFY",
  "result_date": "2026-04-17",
  "period": "Q4 FY26",
  "last_quarter_summary": "...",
  "key_metrics_to_watch": ["Revenue growth guidance", "Attrition rate", "Deal TCV"],
  "positive_signals": ["string"],
  "risk_signals": ["string"],
  "analyst_consensus": "beat expected | in-line expected | miss risk"
}
