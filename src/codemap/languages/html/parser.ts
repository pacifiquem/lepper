import type { LangParse } from '../shared/types';
import { addImport, emptyParse, lineAt, pushSymbol } from '../shared/scan';
import { KEYWORDS } from './keywords';

export const id = 'html';
export const extensions = ['.html', '.htm'];
export { KEYWORDS };

export function parseHtml(source: string): LangParse {
  const parsed = emptyParse();
  pushSymbol(parsed, source, 'document', 'function', 0, 0, source.length, true);
  const srcRe = /<(?:script|link)\b[^>]*?(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = srcRe.exec(source))) {
    const spec = match[1];
    if (/^[a-z]+:/i.test(spec) || spec.startsWith('//')) {
      continue;
    }
    addImport(parsed, spec, lineAt(source, match.index), ['*']);
  }
  const handlerRe = /\bon[a-z]+\s*=\s*["']([^"']+)["']/gi;
  while ((match = handlerRe.exec(source))) {
    const callRe = /([A-Za-z_$][\w$]*)\s*\(/g;
    let call: RegExpExecArray | null;
    while ((call = callRe.exec(match[1]))) {
      const index = match.index + call.index;
      parsed.calls.push({
        name: call[1],
        index,
        line: lineAt(source, index),
      });
    }
  }
  return parsed;
}

export function parse(source: string): LangParse {
  return parseHtml(source);
}
