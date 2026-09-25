import type { LangParse } from '../shared/types';
import { addImport, emptyParse, lineAt } from '../shared/scan';
import { KEYWORDS } from './keywords';

export const id = 'css';
export const extensions = ['.css'];
export { KEYWORDS };

export function parseCss(source: string): LangParse {
  const parsed = emptyParse();
  const pattern = /@import\s+(?:url\(\s*)?["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const spec = match[1];
    if (/^[a-z]+:/i.test(spec)) {
      continue;
    }
    addImport(parsed, spec, lineAt(source, match.index), ['*']);
  }
  return parsed;
}

export function parse(source: string): LangParse {
  return parseCss(source);
}
