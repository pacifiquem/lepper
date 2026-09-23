import { parseBracket } from '../shared/bracket';
import type { LangParse } from '../shared/types';
import { KEYWORDS } from './keywords';

export const id = 'go';
export const extensions = ['.go'];
export { KEYWORDS };

export function parse(source: string): LangParse {
  return parseBracket(source, {
    id,
    extensions,
    keywords: KEYWORDS,
    comments: 'c',
  });
}
