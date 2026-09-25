import { withLepper } from '../../notes/session';
import { recordNote } from '../../notes/notes';
import { str, tagsOf, textResult } from '../params';
import { McpTool } from './types';

export const recordTool: McpTool = {
  name: 'record',
  description:
    'Save a note about a directory or file so other agents can recover that context later without rereading the code. Use this when you learn what a path is for, how it works, or why it exists.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Project-relative path, for example src/cache',
      },
      note: {
        type: 'string',
        description:
          'What this path is, why it exists, important behavior, and useful entry files',
      },
      title: { type: 'string', description: 'Optional short title' },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional tags such as cache, api, entrypoint',
      },
      agent: { type: 'string', description: 'Optional agent name' },
    },
    required: ['path', 'note'],
  },
  call(params, cwd) {
    const note = withLepper(cwd, (store) =>
      recordNote(store, {
        path: str(params, 'path'),
        note: str(params, 'note'),
        title: str(params, 'title') || undefined,
        tags: tagsOf(params),
        agent: str(params, 'agent') || undefined,
      }),
    );
    return textResult({
      ok: true,
      path: note.path,
      fingerprint: note.fingerprint,
      parent: note.parent,
      title: note.title,
    });
  },
};
