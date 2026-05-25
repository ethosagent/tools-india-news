import { describe, expect, it } from 'vitest';
import { createIndiaNewsTools } from '../index';

describe('createIndiaNewsTools', () => {
  it('returns 5 tools', () => {
    const tools = createIndiaNewsTools();
    expect(tools.length).toBe(5);
  });

  it('each tool has required fields', () => {
    const tools = createIndiaNewsTools();
    for (const tool of tools) {
      expect(tool.name).toBeDefined();
      expect(typeof tool.name).toBe('string');
      expect(tool.description).toBeDefined();
      expect(typeof tool.description).toBe('string');
      expect(tool.execute).toBeDefined();
      expect(typeof tool.execute).toBe('function');
      expect(tool.schema).toBeDefined();
      expect(tool.schema.type).toBe('object');
    }
  });

  it('all tools have outputIsUntrusted: true', () => {
    const tools = createIndiaNewsTools();
    for (const tool of tools) {
      expect(tool.outputIsUntrusted).toBe(true);
    }
  });

  it('india_news_search requires query in schema', () => {
    const tools = createIndiaNewsTools();
    const search = tools.find((t) => t.name === 'india_news_search');
    expect(search).toBeDefined();
    expect(search?.schema.required).toContain('query');
  });

  it('has the expected tool names', () => {
    const tools = createIndiaNewsTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('india_news_announcements');
    expect(names).toContain('india_news_earnings_calendar');
    expect(names).toContain('india_news_feed');
    expect(names).toContain('india_news_search');
    expect(names).toContain('india_news_brief');
  });
});
