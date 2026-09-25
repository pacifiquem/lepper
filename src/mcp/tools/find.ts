import { withLepper } from '../../notes/session';
import { findNotes } from '../../search/search';
import { num, str, textResult } from '../params';
import { McpTool, readOnly } from './types';

export const findTool: McpTool = {
  name: 'find',
  description:
    'Find notes with a natural-language query such as "where is caching". Returns the matching note bodies so you do not need to read the implementation.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural-language search query' },
      path: { type: 'string', description: 'Optional path scope' },
      limit: { type: 'number', description: 'Maximum hits to return' },
    },
    required: ['query'],
  },
  annotations: readOnly,
  call(params, cwd) {
    const hits = withLepper(cwd, (store) =>
      findNotes(store, {
        query: str(params, 'query'),
        path: str(params, 'path') || undefined,
        limit: num(params, 'limit'),
      }),
    );
    return textResult({ hits });
  },
};
