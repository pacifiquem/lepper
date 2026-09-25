import { describe, expect, it } from 'vitest';
import {
  bm25Idf,
  bm25Score,
  bm25TermWeight,
  type Bm25Stats,
} from '../src/search/bm25';
import { stem, tokenize } from '../src/utils/text';

const stats: Bm25Stats = {
  docCount: 4,
  avgDocLength: 10,
  df: { cach: 1, token: 4 },
};

describe('bm25', () => {
  it('uses Lucene IDF and saturates term frequency', () => {
    expect(bm25Idf(4, 1)).toBeCloseTo(Math.log(1 + 3.5 / 1.5), 12);
    expect(bm25TermWeight(1, 10, 10)).toBeCloseTo(1, 12);

    const once = bm25Score(['cach'], { tf: { cach: 1 }, length: 10 }, stats);
    const repeated = bm25Score(
      ['cach'],
      { tf: { cach: 10 }, length: 10 },
      stats,
    );
    const longer = bm25Score(['cach'], { tf: { cach: 1 }, length: 30 }, stats);

    expect(once).toBeCloseTo(1.203972804325936, 8);
    expect(repeated).toBeCloseTo(2.364946579925946, 8);
    expect(longer).toBeCloseTo(0.662185042379265, 8);
    expect(repeated).toBeLessThan(once * 3);
    expect(longer).toBeLessThan(once);
  });

  it('weights a rare term above a term that is in every note', () => {
    const rare = bm25Score(['cach'], { tf: { cach: 1 }, length: 10 }, stats);
    const common = bm25Score(
      ['token'],
      { tf: { token: 1 }, length: 10 },
      stats,
    );
    expect(rare).toBeGreaterThan(common * 5);
  });

  it('scores each query term once and ignores missing terms', () => {
    const once = bm25Score(['cach'], { tf: { cach: 1 }, length: 10 }, stats);
    const doubled = bm25Score(
      ['cach', 'cach'],
      { tf: { cach: 1 }, length: 10 },
      stats,
    );
    expect(doubled).toBeCloseTo(once, 12);
    expect(bm25Score(['missing'], { tf: { cach: 1 }, length: 10 }, stats)).toBe(
      0,
    );
  });

  it('prefers a note that contains every query term', () => {
    const corpus: Bm25Stats = {
      docCount: 2,
      avgDocLength: 20,
      df: { cach: 2, expir: 1 },
    };
    const both = bm25Score(
      ['cach', 'expir'],
      { tf: { cach: 1, expir: 1 }, length: 12 },
      corpus,
    );
    const repeated = bm25Score(
      ['cach', 'expir'],
      { tf: { cach: 40 }, length: 40 },
      corpus,
    );
    expect(both).toBeGreaterThan(repeated);
  });
});

describe('search terms', () => {
  it('folds inflections onto one stem', () => {
    const families = [
      ['cache', 'caches', 'cached', 'caching'],
      ['store', 'stores', 'stored', 'storing'],
      ['code', 'codes', 'coding'],
      ['note', 'notes'],
      ['file', 'files'],
      ['memory', 'memories'],
      ['run', 'running'],
      ['use', 'using'],
      ['test', 'tests', 'testing'],
      ['try', 'tried'],
      ['box', 'boxes'],
      ['create', 'creates', 'creating'],
    ];

    for (const words of families) {
      expect(new Set(words.map((word) => stem(word))).size).toBe(1);
    }
  });

  it('does not treat a shared prefix as the same term', () => {
    expect(stem('testimony')).not.toBe(stem('test'));
    expect(stem('authentication')).not.toBe(stem('auth'));
  });

  it('drops stopwords and keeps repeated terms', () => {
    expect(tokenize('where is caching')).toEqual(['cach']);
    expect(tokenize('cache cache')).toEqual(['cach', 'cach']);
    expect(tokenize('InMemoryCache')).toEqual(['memory', 'cach']);
  });
});
