const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'to',
  'of',
  'in',
  'on',
  'for',
  'is',
  'are',
  'was',
  'were',
  'be',
  'with',
  'at',
  'by',
  'from',
  'as',
  'that',
  'this',
  'it',
  'where',
  'what',
  'which',
  'who',
  'how',
  'do',
  'does',
  'did',
  'can',
  'about',
]);

const STEMS: Array<[RegExp, string]> = [
  [/ing$/, ''],
  [/ers$/, 'er'],
  [/ies$/, 'y'],
  [/ied$/, 'y'],
  [/ed$/, ''],
  [/es$/, ''],
  [/s$/, ''],
];

export function tokenize(text: string): string[] {
  const tokens = new Set<string>();

  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/g)) {
    if (raw.length <= 1 || STOPWORDS.has(raw)) {
      continue;
    }
    tokens.add(raw);
    const stemmed = stem(raw);
    if (stemmed.length > 1 && !STOPWORDS.has(stemmed)) {
      tokens.add(stemmed);
    }
  }

  return Array.from(tokens);
}

export function stem(token: string): string {
  if (token.length < 5) {
    return token;
  }

  for (const [pattern, replacement] of STEMS) {
    if (pattern.test(token)) {
      const stemmed = token.replace(pattern, replacement);
      if (stemmed.length >= 3) {
        return stemmed;
      }
    }
  }

  return token;
}

export function excerpt(body: string, max = 160): string {
  const compact = body.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max - 1).trimEnd()}…`;
}

export function titleFrom(body: string, fallback: string): string {
  const first = body
    .split(/[.!?\n]/)[0]
    ?.replace(/\s+/g, ' ')
    .trim();
  if (first && first.length > 0 && first.length <= 80) {
    return first;
  }
  return fallback;
}

export function termFrequency(tokens: string[]): Record<string, number> {
  const tf: Record<string, number> = {};
  for (const token of tokens) {
    tf[token] = (tf[token] || 0) + 1;
  }
  return tf;
}
