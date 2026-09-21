/**
 * Okapi BM25 with Lucene's IDF, which stays non-negative when a term is in
 * more than half of the notes.
 *
 * score = Σ idf(t) · (tf · (k1 + 1)) / (tf + k1 · (1 - b + b · dl / avgdl))
 * idf(t) = ln(1 + (N - df + 0.5) / (df + 0.5))
 *
 * k1 saturates repeated terms. b pulls long notes down when the match is sparse.
 */
export const BM25_K1 = 1.2;
export const BM25_B = 0.75;

export interface Bm25Document {
  tf: Record<string, number>;
  length: number;
}

export interface Bm25Stats {
  docCount: number;
  avgDocLength: number;
  df: Record<string, number>;
}

export function documentFrequencies(
  docs: Bm25Document[],
): Record<string, number> {
  const df: Record<string, number> = {};
  for (const doc of docs) {
    for (const term of Object.keys(doc.tf)) {
      df[term] = (df[term] || 0) + 1;
    }
  }
  return df;
}

export function bm25Stats(docs: Bm25Document[]): Bm25Stats {
  let totalLength = 0;
  for (const doc of docs) {
    totalLength += doc.length > 0 ? doc.length : 0;
  }
  const docCount = docs.length;
  return {
    docCount,
    df: documentFrequencies(docs),
    avgDocLength: docCount > 0 ? totalLength / docCount : 0,
  };
}

export function bm25Idf(docCount: number, docFreq: number): number {
  const documents = docCount > 0 ? docCount : 0;
  const freq = docFreq > 0 ? docFreq : 0;
  return Math.log(1 + (documents - freq + 0.5) / (freq + 0.5));
}

export function bm25TermWeight(
  tf: number,
  docLength: number,
  avgDocLength: number,
  k1: number = BM25_K1,
  b: number = BM25_B,
): number {
  if (tf <= 0) {
    return 0;
  }
  const average = avgDocLength > 0 ? avgDocLength : 1;
  const length = docLength > 0 ? docLength : 1;
  const normalizedLength = 1 - b + b * (length / average);
  return (tf * (k1 + 1)) / (tf + k1 * normalizedLength);
}

/**
 * Each query term is scored once. Document tf still counts every occurrence,
 * so repeating a word in the note saturates instead of multiplying the rank.
 */
export function bm25Score(
  queryTerms: string[],
  doc: Bm25Document,
  stats: Bm25Stats,
  k1: number = BM25_K1,
  b: number = BM25_B,
): number {
  const seen = new Set<string>();
  let score = 0;

  for (const term of queryTerms) {
    if (seen.has(term)) {
      continue;
    }
    seen.add(term);

    const tf = doc.tf[term] || 0;
    if (tf <= 0) {
      continue;
    }

    score +=
      bm25Idf(stats.docCount, stats.df[term] || 0) *
      bm25TermWeight(tf, doc.length, stats.avgDocLength, k1, b);
  }

  return score;
}
