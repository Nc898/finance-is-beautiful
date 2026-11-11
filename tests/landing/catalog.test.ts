import { describe, expect, it } from 'vitest';
import { CATALOG, TOPICS, searchCatalog } from '../../src/landing/catalog';

const slugs = (q: string) => searchCatalog(q, CATALOG).map((e) => e.slug);

describe('the catalog', () => {
  it('files every demonstration under a known topic, with a concept and a one-sentence summary', () => {
    const topics = new Set(TOPICS.map((t) => t.id));
    for (const e of CATALOG) {
      expect(topics.has(e.topic)).toBe(true);
      expect(e.concept.length).toBeGreaterThan(0);
      expect(e.summary.endsWith('.')).toBe(true);
      expect(e.summary.split(/[.!?](\s|$)/).filter((s) => s.trim()).length).toBe(1);
      // the house copy rules: no em-dashes
      expect(`${e.concept} ${e.summary}`).not.toMatch(/—/);
    }
  });

  it('has no duplicate slugs and no empty topic', () => {
    expect(new Set(CATALOG.map((e) => e.slug)).size).toBe(CATALOG.length);
    for (const t of TOPICS) expect(CATALOG.some((e) => e.topic === t.id)).toBe(true);
  });
});

describe('searchCatalog', () => {
  it('finds every loan demonstration by topic, even without "loan" in its title', () => {
    expect(slugs('loans')).toEqual(['brick-by-brick', 'nip-it-in-the-bud', 'on-a-roll']);
    expect(slugs('loan repayment')).toEqual(['brick-by-brick', 'nip-it-in-the-bud', 'on-a-roll']);
  });

  it('finds by concept, search word and topic heading, ignoring case', () => {
    expect(slugs('Mortgage')).toEqual(['brick-by-brick']);
    expect(slugs('401k')).toEqual(['low-hanging-fruit']);
    expect(slugs('investing')).toEqual(['time-to-grow', 'low-hanging-fruit']);
    expect(slugs('inflation')).toEqual(['against-the-current', 'bread-and-butter']);
    expect(slugs('groceries')).toEqual(['bread-and-butter']);
    expect(slugs('wages')).toEqual(['bread-and-butter']);
    expect(slugs('snowball')).toEqual(['on-a-roll']);
  });

  it('needs every word of the query, and an empty query returns everything', () => {
    expect(slugs('credit card minimum')).toEqual(['nip-it-in-the-bud']);
    expect(slugs('mortgage snowball')).toEqual([]);
    expect(slugs('   ')).toHaveLength(CATALOG.length);
  });
});
