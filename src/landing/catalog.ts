/**
 * The collection as data: each demonstration's topic, the personal finance concept it teaches, a one-sentence
 * explanation of that concept, and the words someone might search for to find it. Pure data (no painting), so
 * the landing page, a future search field and the tests can all read it. The previews are attached in demos.ts.
 *
 * Adding a demonstration: one entry here (and its painter in demos.ts). A new topic: one entry in TOPICS.
 */

export type TopicId = 'investing' | 'debt' | 'inflation';

export interface Topic {
  id: TopicId;
  /** the heading the topic's demonstrations are grouped under on the landing page */
  heading: string;
}

/** in the order they appear on the landing page */
export const TOPICS: Topic[] = [
  { id: 'investing', heading: 'Investing' },
  { id: 'debt', heading: 'Loans and debt' },
  { id: 'inflation', heading: 'Prices and inflation' },
];

export interface CatalogEntry {
  slug: string;
  title: string;
  href: string;
  topic: TopicId;
  /** the personal finance concept the demonstration teaches, in a few words */
  concept: string;
  /** one sentence explaining that concept, as the demonstration shows it */
  summary: string;
  /** words someone might search for (lower case; the title, concept, summary and topic are searched too) */
  tags: string[];
  /** The entry's accent and ornament on the landing page: the grove's emerald, the river's teal and waves, the
   *  vine's autumn rust, tendrils and falling leaves, the snow's winter blue, snowflakes and birds on the rule,
   *  the bricks' deep red, a course of bricks for the rule and a blossom wash, or the orchard's harvest ochre, a
   *  twig hung with golden and red apples for the rule and a late-summer wash. */
  theme: 'grove' | 'river' | 'vine' | 'snow' | 'brick' | 'orchard';
}

/** in the order they appear within their topic */
export const CATALOG: CatalogEntry[] = [
  {
    slug: 'time-to-grow',
    title: 'Time to Grow',
    href: './time-to-grow.html',
    topic: 'investing',
    concept: 'Compound growth',
    summary: 'Money invested earlier has more years to earn on its own earnings.',
    tags: ['compound interest', 'saving', 'retirement', 'starting early', 'returns'],
    theme: 'grove',
  },
  {
    slug: 'low-hanging-fruit',
    title: 'Low-Hanging Fruit',
    href: './low-hanging-fruit.html',
    topic: 'investing',
    concept: 'Employer match',
    summary: 'Saving enough to get the full match is free money, and a year you miss can’t be made up.',
    tags: ['401(k)', '401k', 'retirement', 'workplace plan', 'saving', 'free money'],
    theme: 'orchard',
  },
  {
    slug: 'brick-by-brick',
    title: 'Brick by Brick',
    href: './brick-by-brick.html',
    topic: 'debt',
    concept: 'Loan term',
    summary: 'A 15-year mortgage costs more each month, but far less in interest overall.',
    tags: ['loans', 'loan repayment', 'mortgage', 'home loan', 'house', 'interest', '15-year', '30-year'],
    theme: 'brick',
  },
  {
    slug: 'nip-it-in-the-bud',
    title: 'Nip It in the Bud',
    href: './nip-it-in-the-bud.html',
    topic: 'debt',
    concept: 'Credit card interest',
    summary: 'Paying only the minimum keeps you in debt for years and costs far more in interest.',
    tags: ['loans', 'loan repayment', 'credit card', 'minimum payment', 'apr', 'interest'],
    theme: 'vine',
  },
  {
    slug: 'on-a-roll',
    title: 'On a Roll',
    href: './on-a-roll.html',
    topic: 'debt',
    concept: 'Debt payoff order',
    summary: 'Paying the smallest debt first brings quicker wins; the highest rate first costs less.',
    tags: ['loans', 'loan repayment', 'snowball', 'avalanche', 'debt payoff', 'credit card', 'car loan', 'interest'],
    theme: 'snow',
  },
  {
    slug: 'against-the-current',
    title: 'Against the Current',
    href: './against-the-current.html',
    topic: 'inflation',
    concept: 'Inflation',
    summary: 'As prices rise, the same dollars buy a little less each year.',
    tags: ['prices', 'purchasing power', 'cost of living', 'saving', 'cash'],
    theme: 'river',
  },
];

const topicHeading = (id: TopicId): string => TOPICS.find((t) => t.id === id)?.heading ?? '';

/**
 * Demonstrations matching a search (not on the page yet; for the search field the collection will get once it
 * has around ten demonstrations). Every word of the query must appear somewhere in the entry's title, concept,
 * summary, topic or search words. An empty query matches everything.
 */
export function searchCatalog<T extends CatalogEntry>(query: string, entries: readonly T[]): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...entries];
  return entries.filter((e) => {
    const text = [e.title, e.concept, e.summary, topicHeading(e.topic), ...e.tags].join(' ').toLowerCase();
    return words.every((w) => text.includes(w));
  });
}
