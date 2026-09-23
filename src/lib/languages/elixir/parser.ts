import { KEYWORDS as ELIXIR_KEYWORDS } from './keywords';
import type { LangParse } from '../shared/types';
import {
  addImport,
  emptyParse,
  lineAt,
  maskSource,
  pushSymbol,
} from '../shared/scan';
export function parseElixir(source: string): LangParse {
  const masked = maskSource(source, 'hash');
  const parsed = emptyParse();
  const keywords = new Set(ELIXIR_KEYWORDS);
  const aliasRe = /alias\s+([A-Z][\w.]*)(?:\s*,\s*as:\s*([A-Z]\w*))?/g;
  let match: RegExpExecArray | null;
  while ((match = aliasRe.exec(masked))) {
    const parts = match[1].split('.');
    const local = match[2] || parts[parts.length - 1];
    addImport(parsed, match[1], lineAt(masked, match.index), ['*'], {
      local,
      imported: '*',
    });
  }
  const importRe = /(?:^|\n)\s*import\s+([A-Z][\w.]*)/g;
  while ((match = importRe.exec(masked))) {
    addImport(parsed, match[1], lineAt(masked, match.index), ['*']);
  }
  const moduleRe = /defmodule\s+([A-Z][\w.]*)\s+do/g;
  while ((match = moduleRe.exec(masked))) {
    const bodyStart = masked.indexOf('do', match.index);
    const bodyEnd = matchingEnd(masked, bodyStart);
    pushSymbol(
      parsed,
      masked,
      match[1].split('.').pop() || match[1],
      'class',
      match.index,
      bodyStart,
      bodyEnd,
      true,
      match[1],
    );
  }
  const defRe = /\bdefp?\s+([a-zA-Z_]\w*)\b/g;
  while ((match = defRe.exec(masked))) {
    const lineEnd = masked.indexOf('\n', match.index);
    const doAt = masked.indexOf('do', match.index);
    let bodyStart = match.index;
    let bodyEnd = lineEnd === -1 ? masked.length : lineEnd;
    if (doAt !== -1 && (lineEnd === -1 || doAt < lineEnd)) {
      bodyStart = doAt;
      bodyEnd = matchingEnd(masked, doAt);
    } else {
      const nextDo = lineEnd === -1 ? -1 : masked.indexOf('do', lineEnd);
      const nextLine = lineEnd === -1 ? -1 : masked.indexOf('\n', lineEnd + 1);
      if (nextDo !== -1 && (nextLine === -1 || nextDo < nextLine)) {
        bodyStart = nextDo;
        bodyEnd = matchingEnd(masked, nextDo);
      }
    }
    const owner = parsed.symbols.find(
      (symbol) =>
        symbol.kind === 'class' &&
        match &&
        match.index > symbol.bodyStart &&
        match.index < symbol.bodyEnd,
    );
    const qualified = owner ? `${owner.qualified}.${match[1]}` : match[1];
    pushSymbol(
      parsed,
      masked,
      match[1],
      owner ? 'method' : 'function',
      match.index,
      bodyStart,
      bodyEnd,
      true,
      qualified,
    );
  }
  const callRe = /([A-Za-z_]\w*)(?:\.([A-Za-z_]\w*))?\s*\(/g;
  while ((match = callRe.exec(masked))) {
    const name = match[2] || match[1];
    if (keywords.has(name) || keywords.has(match[1])) {
      continue;
    }
    const index = match[2] ? match.index + match[1].length + 1 : match.index;
    parsed.calls.push({
      name,
      qualifier: match[2] ? match[1] : undefined,
      index,
      line: lineAt(masked, index),
    });
  }
  return parsed;
}

export function matchingEnd(source: string, doIndex: number): number {
  let depth = 0;
  const token = /\b(do|end)\b/g;
  token.lastIndex = doIndex;
  let match: RegExpExecArray | null;
  while ((match = token.exec(source))) {
    depth += match[1] === 'do' ? 1 : -1;
    if (depth === 0) {
      return match.index + match[0].length;
    }
  }
  return source.length;
}

export const id = 'elixir';
export const extensions = ['.ex', '.exs'];
export { ELIXIR_KEYWORDS as KEYWORDS };

export function parse(source: string): LangParse {
  return parseElixir(source);
}
