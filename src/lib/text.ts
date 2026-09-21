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

function isConsonant(char: string): boolean {
  return 'aeiou'.indexOf(char) === -1;
}

function endsCvc(word: string): boolean {
  if (word.length < 3) {
    return false;
  }
  const first = word[word.length - 3];
  const middle = word[word.length - 2];
  const last = word[word.length - 1];
  if (!isConsonant(first) || isConsonant(middle) || !isConsonant(last)) {
    return false;
  }
  return last !== 'w' && last !== 'x' && last !== 'y';
}

function stemInflection(word: string): string {
  if (word.length >= 5 && word.endsWith('ied')) {
    return `${word.slice(0, -3)}y`;
  }
  if (word.length < 5 || (!word.endsWith('ing') && !word.endsWith('ed'))) {
    return word;
  }

  const suffixLength = word.endsWith('ing') ? 3 : 2;
  const base = word.slice(0, -suffixLength);
  if (base.length < 2 || !/[aeiou]/.test(base)) {
    return word;
  }

  let stemmed = base;
  let undoubled = false;
  if (
    stemmed.length >= 2 &&
    stemmed[stemmed.length - 1] === stemmed[stemmed.length - 2] &&
    isConsonant(stemmed[stemmed.length - 1])
  ) {
    stemmed = stemmed.slice(0, -1);
    undoubled = true;
  }

  if (!undoubled && stemmed.length === 3 && endsCvc(stemmed)) {
    return `${stemmed}e`;
  }
  if (
    !undoubled &&
    stemmed.length === 2 &&
    !isConsonant(stemmed[0]) &&
    isConsonant(stemmed[1])
  ) {
    return `${stemmed}e`;
  }
  return stemmed;
}

function stemPlural(word: string): string {
  if (word.length >= 5 && word.endsWith('ies')) {
    return `${word.slice(0, -3)}y`;
  }
  if (word.length >= 5 && word.endsWith('es')) {
    const base = word.slice(0, -2);
    if (/(?:s|x|z|ch|sh|o)$/.test(base)) {
      return base;
    }
  }
  if (
    word.length >= 4 &&
    word.endsWith('s') &&
    !word.endsWith('ss') &&
    !word.endsWith('us') &&
    !word.endsWith('is')
  ) {
    return word.slice(0, -1);
  }
  return word;
}

function stripSilentE(word: string): string {
  if (
    word.length >= 5 &&
    word.endsWith('e') &&
    !word.endsWith('ee') &&
    /[aeiou]/.test(word.slice(0, -1))
  ) {
    return word.slice(0, -1);
  }
  return word;
}

export function stem(token: string): string {
  if (token.length < 4 || /^\d+$/.test(token)) {
    return token;
  }

  const inflected = stemInflection(token);
  const next = inflected === token ? stemPlural(token) : inflected;
  const stemmed = stripSilentE(next);
  if (stemmed.length < 2 || STOPWORDS.has(stemmed)) {
    return token;
  }
  return stemmed;
}

export function tokenize(text: string): string[] {
  const prepared = text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  const tokens: string[] = [];

  for (const raw of prepared.toLowerCase().split(/[^a-z0-9]+/g)) {
    if (raw.length <= 1 || STOPWORDS.has(raw)) {
      continue;
    }
    const stemmed = stem(raw);
    if (stemmed.length <= 1 || STOPWORDS.has(stemmed)) {
      continue;
    }
    tokens.push(stemmed);
  }

  return tokens;
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
