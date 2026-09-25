import { syncNotes } from '../../notes/sync';
import { withLepper } from '../../notes/session';
import { textResult } from '../params';
import { McpTool } from './types';

export const syncTool: McpTool = {
  name: 'sync',
  description:
    'Fetch refs/lepper/notes from origin, merge those notes with this clone, and push the result. Run this after clone and after recording notes other people should see.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  call(_params, cwd) {
    const result = withLepper(cwd, (store) => syncNotes(store.root));
    return textResult(result);
  },
};
