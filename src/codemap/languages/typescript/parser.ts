import { parseJs } from '../javascript/parser';
import type { LangParse } from '../shared/types';
import { KEYWORDS } from './keywords';

export const id = 'typescript';
export const extensions = ['.ts', '.tsx', '.mts', '.cts'];
export { KEYWORDS };

export function parse(source: string): LangParse {
  return parseJs(source, new Set(KEYWORDS));
}
