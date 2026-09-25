import { formatMap, projectMap } from '../../notes/map';
import { getNote, historyFor } from '../../notes/notes';
import { withLepper } from '../../notes/session';
import { normalizeProjectPath } from '../../utils/paths';
import { str, textResult } from '../params';
import { McpTool, readOnly } from './types';

export const mapTool: McpTool = {
  name: 'map',
  description:
    'Return an overview of recorded project notes, optionally scoped to a path. Use this to see the structure other agents have already documented.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Optional path prefix to focus the map',
      },
    },
  },
  annotations: readOnly,
  call(params, cwd) {
    return withLepper(cwd, (store) => {
      const prefix = str(params, 'path')
        ? normalizeProjectPath(str(params, 'path'), store.root)
        : undefined;
      const tree = projectMap(store, prefix);
      const focused = prefix ? getNote(store, prefix) : undefined;
      const history = prefix ? historyFor(store, prefix) : [];
      return textResult({
        map: formatMap(tree),
        tree,
        note: focused || null,
        history: history.map((item) => ({
          fingerprint: item.fingerprint,
          createdAt: item.createdAt,
          agent: item.agent,
          title: item.title,
        })),
      });
    });
  },
};
