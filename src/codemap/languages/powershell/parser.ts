import { KEYWORDS as POWERSHELL_KEYWORDS } from './keywords';
import type { LangParse } from '../shared/types';
import {
  addImport,
  emptyParse,
  lineAt,
  maskSource,
  pushSymbol,
  skipBalanced,
} from '../shared/scan';

export function parsePowerShell(source: string): LangParse {
  const masked = maskSource(source, 'hash');
  const parsed = emptyParse();
  const keywords = new Set(POWERSHELL_KEYWORDS);
  const dot = /(?:^|\n)\s*\.\s+(\.{0,2}\/?[\w./\\-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = dot.exec(masked))) {
    addImport(
      parsed,
      match[1].replace(/\\/g, '/'),
      lineAt(masked, match.index),
      ['*'],
    );
  }
  const defRe = /function\s+([A-Za-z_][\w-]*)\s*\{/g;
  while ((match = defRe.exec(masked))) {
    const brace = masked.indexOf('{', match.index);
    const bodyEnd =
      brace === -1 ? masked.length : skipBalanced(masked, brace, '{', '}');
    pushSymbol(
      parsed,
      masked,
      match[1],
      'function',
      match.index,
      brace,
      bodyEnd,
      true,
    );
  }
  const callRe = /(^|[\n;|&{}])\s*([A-Za-z_][\w-]*)\b/g;
  while ((match = callRe.exec(masked))) {
    const name = match[2];
    if (keywords.has(name) || name === 'function') {
      continue;
    }
    const index = match.index + match[1].length + match[0].lastIndexOf(name);
    parsed.calls.push({ name, index, line: lineAt(masked, index) });
  }
  return parsed;
}

export const id = 'powershell';
export const extensions = ['.ps1', '.psm1'];
export { POWERSHELL_KEYWORDS as KEYWORDS };

export function parse(source: string): LangParse {
  return parsePowerShell(source);
}
