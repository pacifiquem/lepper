import { KEYWORDS as SQL_KEYWORDS } from './keywords';
import type { LangParse } from '../shared/types';
import { emptyParse, lineAt, maskSource, pushSymbol } from '../shared/scan';
export function parseSql(source: string): LangParse {
  const masked = maskSource(source, 'sql');
  const parsed = emptyParse();
  const keywords = new Set(SQL_KEYWORDS.map((word) => word.toLowerCase()));
  const defRe =
    /create\s+(?:or\s+replace\s+)?(?:temp(?:orary)?\s+)?(function|procedure)\s+([A-Za-z_][\w$]*)/gi;
  const defs: Array<{ name: string; index: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = defRe.exec(masked))) {
    defs.push({
      name: match[2],
      index: match.index + match[0].lastIndexOf(match[2]),
      end: masked.length,
    });
  }
  for (let i = 0; i < defs.length; i++) {
    defs[i].end = i + 1 < defs.length ? defs[i + 1].index : masked.length;
    pushSymbol(
      parsed,
      masked,
      defs[i].name,
      'function',
      defs[i].index,
      defs[i].index,
      defs[i].end,
      true,
    );
  }
  const callRe = /([A-Za-z_][\w$]*)\s*\(/g;
  while ((match = callRe.exec(masked))) {
    if (keywords.has(match[1].toLowerCase())) {
      continue;
    }
    parsed.calls.push({
      name: match[1],
      index: match.index,
      line: lineAt(masked, match.index),
    });
  }
  return parsed;
}

export const id = 'sql';
export const extensions = ['.sql'];
export { SQL_KEYWORDS as KEYWORDS };

export function parse(source: string): LangParse {
  return parseSql(source);
}
