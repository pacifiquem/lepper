import { KEYWORDS as ERLANG_KEYWORDS } from './keywords';
import type { LangParse } from '../shared/types';
import {
  addImport,
  emptyParse,
  lineAt,
  maskSource,
  pushSymbol,
} from '../shared/scan';
export function parseErlang(source: string): LangParse {
  const masked = maskSource(source, 'erlang');
  const parsed = emptyParse();
  const keywords = new Set(ERLANG_KEYWORDS);
  const includeRe = /-include(?:_lib)?\(\s*"([^"]+)"\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = includeRe.exec(masked))) {
    addImport(parsed, match[1], lineAt(masked, match.index), ['*']);
  }
  const moduleRe = /-module\(\s*([a-z][\w]*)\s*\)/;
  const moduleMatch = moduleRe.exec(masked);
  const moduleName = moduleMatch?.[1] || '';
  if (moduleName) {
    pushSymbol(
      parsed,
      masked,
      moduleName,
      'class',
      moduleMatch?.index || 0,
      0,
      masked.length,
      true,
    );
  }
  const defRe =
    /(?:^|\n)([a-z][A-Za-z0-9_]*)\s*\([^)]*\)\s*(?:when\b[\s\S]*?)?->/g;
  const seen = new Set<string>();
  while ((match = defRe.exec(masked))) {
    if (keywords.has(match[1]) || seen.has(match[1])) {
      continue;
    }
    seen.add(match[1]);
    pushSymbol(
      parsed,
      masked,
      match[1],
      'function',
      match.index,
      match.index,
      masked.length,
      true,
      moduleName ? `${moduleName}:${match[1]}` : match[1],
    );
  }
  const callRe = /([a-z][A-Za-z0-9_]*):([a-z][A-Za-z0-9_]*)\s*\(/g;
  while ((match = callRe.exec(masked))) {
    parsed.calls.push({
      name: match[2],
      qualifier: match[1],
      index: match.index + match[1].length + 1,
      line: lineAt(masked, match.index),
    });
  }
  const bareRe = /(^|[^:\w])([a-z][A-Za-z0-9_]*)\s*\(/g;
  while ((match = bareRe.exec(masked))) {
    if (keywords.has(match[2])) {
      continue;
    }
    const index = match.index + match[1].length;
    parsed.calls.push({ name: match[2], index, line: lineAt(masked, index) });
  }
  return parsed;
}

export const id = 'erlang';
export const extensions = ['.erl', '.hrl'];
export { ERLANG_KEYWORDS as KEYWORDS };

export function parse(source: string): LangParse {
  return parseErlang(source);
}
