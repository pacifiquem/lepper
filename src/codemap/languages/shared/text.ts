export function lineAt(source: string, index: number): number {
  let line = 1;
  const end = Math.min(index, source.length);
  for (let i = 0; i < end; i++) {
    if (source.charCodeAt(i) === 10) {
      line++;
    }
  }
  return line;
}

export function blankRange(chars: string[], from: number, to: number): void {
  for (let i = from; i < to && i < chars.length; i++) {
    if (chars[i] !== '\n') {
      chars[i] = ' ';
    }
  }
}

export function maskJsString(chars: string[], start: number): number {
  const quote = chars[start];
  chars[start] = ' ';
  let i = start + 1;
  while (i < chars.length) {
    if (chars[i] === '\\') {
      if (chars[i] !== '\n') {
        chars[i] = ' ';
      }
      i++;
      if (i < chars.length && chars[i] !== '\n') {
        chars[i] = ' ';
      }
      i++;
      continue;
    }
    if (quote === '`' && chars[i] === '$' && chars[i + 1] === '{') {
      chars[i] = ' ';
      chars[i + 1] = ' ';
      i += 2;
      let depth = 1;
      while (i < chars.length && depth > 0) {
        const c = chars[i];
        if (c === '"' || c === "'" || c === '`') {
          i = maskJsString(chars, i);
          continue;
        }
        if (c === '/' && chars[i + 1] === '/') {
          const from = i;
          while (i < chars.length && chars[i] !== '\n') {
            i++;
          }
          blankRange(chars, from, i);
          continue;
        }
        if (c === '{') {
          depth++;
        } else if (c === '}') {
          depth--;
          if (depth === 0) {
            chars[i] = ' ';
            i++;
            break;
          }
        }
        i++;
      }
      continue;
    }
    if (chars[i] === quote) {
      chars[i] = ' ';
      return i + 1;
    }
    if (chars[i] !== '\n') {
      chars[i] = ' ';
    }
    i++;
  }
  return i;
}

export function maskJs(source: string): string {
  const chars = source.split('');
  let i = 0;
  while (i < chars.length) {
    const c = chars[i];
    const d = chars[i + 1];
    if (c === '/' && d === '/') {
      const from = i;
      i += 2;
      while (i < chars.length && chars[i] !== '\n') {
        i++;
      }
      blankRange(chars, from, i);
      continue;
    }
    if (c === '/' && d === '*') {
      const from = i;
      i += 2;
      while (i < chars.length && !(chars[i] === '*' && chars[i + 1] === '/')) {
        i++;
      }
      i = Math.min(chars.length, i + 2);
      blankRange(chars, from, i);
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      i = maskJsString(chars, i);
      continue;
    }
    i++;
  }
  return chars.join('');
}

export function maskHashAndQuotes(
  source: string,
  hashComments: boolean,
): string {
  const chars = source.split('');
  let i = 0;
  while (i < chars.length) {
    const c = chars[i];
    if (hashComments && c === '#') {
      const from = i;
      while (i < chars.length && chars[i] !== '\n') {
        i++;
      }
      blankRange(chars, from, i);
      continue;
    }
    if (c === '/' && chars[i + 1] === '/') {
      const from = i;
      i += 2;
      while (i < chars.length && chars[i] !== '\n') {
        i++;
      }
      blankRange(chars, from, i);
      continue;
    }
    if (c === '/' && chars[i + 1] === '*') {
      const from = i;
      i += 2;
      while (i < chars.length && !(chars[i] === '*' && chars[i + 1] === '/')) {
        i++;
      }
      i = Math.min(chars.length, i + 2);
      blankRange(chars, from, i);
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      const triple =
        (quote === '"' || quote === "'") &&
        chars[i + 1] === quote &&
        chars[i + 2] === quote;
      const from = i;
      i += triple ? 3 : 1;
      while (i < chars.length) {
        if (chars[i] === '\\') {
          i += 2;
          continue;
        }
        if (
          triple &&
          chars[i] === quote &&
          chars[i + 1] === quote &&
          chars[i + 2] === quote
        ) {
          i += 3;
          break;
        }
        if (!triple && chars[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      blankRange(chars, from, i);
      continue;
    }
    i++;
  }
  return chars.join('');
}

export function skipWs(source: string, index: number): number {
  let i = index;
  while (i < source.length && /\s/.test(source[i])) {
    i++;
  }
  return i;
}

export function readIdent(
  source: string,
  index: number,
): { name: string; end: number } | null {
  if (!/[A-Za-z_$]/.test(source[index] || '')) {
    return null;
  }
  let end = index + 1;
  while (end < source.length && /[\w$]/.test(source[end])) {
    end++;
  }
  return { name: source.slice(index, end), end };
}

export function startsWithIdent(
  source: string,
  index: number,
  name: string,
): boolean {
  const ident = readIdent(source, index);
  return ident?.name === name;
}

export function skipBalanced(
  source: string,
  index: number,
  open: string,
  close: string,
): number {
  let depth = 0;
  for (let i = index; i < source.length; i++) {
    if (source[i] === open) {
      depth++;
    } else if (source[i] === close) {
      depth--;
      if (depth === 0) {
        return i + 1;
      }
    }
  }
  return source.length;
}

export function statementEnd(source: string, index: number): number {
  let paren = 0;
  let brace = 0;
  let bracket = 0;
  for (let i = index; i < source.length; i++) {
    const c = source[i];
    if (c === '(') paren++;
    else if (c === ')') paren = Math.max(0, paren - 1);
    else if (c === '{') brace++;
    else if (c === '}') {
      if (brace === 0) {
        return i;
      }
      brace--;
    } else if (c === '[') bracket++;
    else if (c === ']') bracket = Math.max(0, bracket - 1);
    else if (
      (c === ';' || c === '\n') &&
      paren === 0 &&
      brace === 0 &&
      bracket === 0
    ) {
      if (c === '\n') {
        const next = skipWs(source, i + 1);
        const nextIdent = readIdent(source, next);
        if (
          nextIdent &&
          !STATEMENT_STARTS.has(nextIdent.name) &&
          source[next] !== '}'
        ) {
          continue;
        }
      }
      return i + 1;
    }
  }
  return source.length;
}

const STATEMENT_STARTS = new Set([
  'import',
  'export',
  'function',
  'class',
  'const',
  'let',
  'var',
  'async',
  'return',
  'if',
  'for',
  'while',
  'switch',
  'try',
  'throw',
  'do',
]);
