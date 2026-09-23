import type { CommentStyle, LangKind, LangParse } from './types';

export function addImport(
  parsed: LangParse,
  spec: string,
  line: number,
  names: string[],
  binding?: { local: string; imported: string },
): void {
  if (!spec) {
    return;
  }
  parsed.imports.push({ spec, line, names });
  if (binding) {
    parsed.bindings.set(binding.local, {
      spec,
      imported: binding.imported,
      line,
    });
  }
}

export function emptyParse(): LangParse {
  return {
    symbols: [],
    calls: [],
    bindings: new Map(),
    exports: [],
    imports: [],
  };
}

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

export function maskSource(source: string, comments: CommentStyle): string {
  const chars = source.split('');
  let i = 0;
  while (i < chars.length) {
    const c = chars[i];
    if (
      (comments === 'hash' && c === '#') ||
      (comments === 'erlang' && c === '%') ||
      (comments === 'sql' && c === '-' && chars[i + 1] === '-')
    ) {
      const from = i;
      while (i < chars.length && chars[i] !== '\n') {
        i++;
      }
      blankRange(chars, from, i);
      continue;
    }
    if (
      (comments === 'c' || comments === 'sql') &&
      c === '/' &&
      chars[i + 1] === '/'
    ) {
      const from = i;
      i += 2;
      while (i < chars.length && chars[i] !== '\n') {
        i++;
      }
      blankRange(chars, from, i);
      continue;
    }
    if (
      c === '/' &&
      chars[i + 1] === '*' &&
      comments !== 'hash' &&
      comments !== 'erlang'
    ) {
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
      const from = i;
      i++;
      while (i < chars.length) {
        if (chars[i] === '\\') {
          i += 2;
          continue;
        }
        if (chars[i] === quote) {
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
  if (!/[A-Za-z_]/.test(source[index] || '')) {
    return null;
  }
  let end = index + 1;
  while (end < source.length && /[\w]/.test(source[end])) {
    end++;
  }
  return { name: source.slice(index, end), end };
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

export function signatureKind(
  source: string,
  parenEnd: number,
): 'def' | 'decl' | 'call' {
  let i = parenEnd;
  while (i < source.length) {
    const c = source[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '{') {
      return 'def';
    }
    if (c === ';') {
      return 'decl';
    }
    if (/[\w:*&<>,[\]:]/.test(c)) {
      i++;
      continue;
    }
    return 'call';
  }
  return 'call';
}

export const CONTROL = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'return',
  'foreach',
  'elif',
  'until',
  'when',
  'sizeof',
  'typeof',
  'alignof',
  'new',
  'delete',
  'case',
]);

export function previousIdent(source: string, index: number): string {
  let i = index - 1;
  while (i >= 0 && /\s/.test(source[i])) {
    i--;
  }
  if (i >= 0 && (source[i] === '.' || source[i] === ':')) {
    return '.';
  }
  const end = i + 1;
  while (i >= 0 && /[\w]/.test(source[i])) {
    i--;
  }
  return source.slice(i + 1, end);
}

export function pushSymbol(
  parsed: LangParse,
  source: string,
  name: string,
  kind: LangKind,
  index: number,
  bodyStart: number,
  bodyEnd: number,
  exported: boolean,
  qualified = name,
): void {
  parsed.symbols.push({
    name,
    qualified,
    kind,
    line: lineAt(source, index),
    exported,
    bodyStart,
    bodyEnd,
  });
  if (exported) {
    parsed.exports.push({ publicName: name, localName: name });
    if (qualified !== name) {
      parsed.exports.push({ publicName: qualified, localName: name });
    }
  }
}
