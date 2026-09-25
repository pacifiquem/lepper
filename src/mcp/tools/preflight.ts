import { withLepper } from '../../notes/session';
import { formatPreflight, preflightReport } from '../../preflight/preflight';
import { num, str, textResult } from '../params';
import { McpTool, readOnly } from './types';

function flag(params: Record<string, unknown>, key: string): boolean {
  const value = params[key];
  return value === true || value === 'true' || value === 1;
}

export const preflightTool: McpTool = {
  name: 'preflight',
  description:
    'First call before changing code. Briefs what an agent should know about a file, symbol, path#symbol, or the current working tree diff: recorded notes, active todos, notes that may be stale, affected files, callers, tests, and suggested verification. Use blast, find, map, or todo when you need one of those slices in detail.',
  inputSchema: {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        description:
          'File path, symbol name, or path#symbol. Omit when diff is true.',
      },
      diff: {
        type: 'boolean',
        description:
          'Brief the files changed in the working tree instead of a single target.',
      },
      depth: {
        type: 'number',
        description: 'How many caller hops to follow. Default 4.',
      },
    },
  },
  annotations: readOnly,
  call(params, cwd) {
    const report = withLepper(cwd, (store) =>
      preflightReport(cwd, store, {
        target: str(params, 'target') || undefined,
        diff: flag(params, 'diff'),
        depth: num(params, 'depth'),
      }),
    );
    return textResult({
      summary: formatPreflight(report),
      ...report,
    });
  },
};
