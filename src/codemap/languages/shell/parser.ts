import { KEYWORDS as SHELL_KEYWORDS } from './keywords';
import type { LangParse } from '../shared/types';
import {
  addImport,
  emptyParse,
  lineAt,
  maskSource,
  pushSymbol,
  skipBalanced,
} from '../shared/scan';

export function parseShell(source: string): LangParse {
  const masked = maskSource(source, 'hash');
  const parsed = emptyParse();
  const keywords = new Set(SHELL_KEYWORDS);
  const sourceRe = /(?:^|\n)\s*(?:source|\.)\s+(\.{0,2}\/?[\w./-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = sourceRe.exec(masked))) {
    addImport(parsed, match[1], lineAt(masked, match.index), ['*']);
  }
  const defRe = /(?:^|\n)\s*(?:function\s+)?([A-Za-z_]\w*)\s*\(\s*\)\s*\{/g;
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
  const lines = masked.split('\n');
  let offset = 0;
  for (const line of lines) {
    const command = line.trim().match(/^([A-Za-z_]\w*)\b/);
    if (
      command &&
      !keywords.has(command[1]) &&
      !line.includes(`${command[1]}()`) &&
      !line.trim().startsWith('function ')
    ) {
      const column = line.indexOf(command[1]);
      parsed.calls.push({
        name: command[1],
        index: offset + column,
        line: lineAt(masked, offset + column),
      });
    }
    offset += line.length + 1;
  }
  return parsed;
}

export const id = 'shell';
export const extensions = ['.sh', '.bash', '.zsh'];
export { SHELL_KEYWORDS as KEYWORDS };

export function parse(source: string): LangParse {
  return parseShell(source);
}
