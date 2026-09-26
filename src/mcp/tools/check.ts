import { withLepper } from '../../notes/session';
import { checkRules, formatCheck } from '../../rules/check';
import { str, textResult } from '../params';
import { McpTool, readOnly } from './types';

export const checkTool: McpTool = {
  name: 'check',
  description:
    'Check architecture rules against the source tree. A broken rule means files under `from` import or call `to`. Pass an optional path to only report violations in that file or directory.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Optional file or directory to limit the report.',
      },
    },
  },
  annotations: readOnly,
  call(params, cwd) {
    const report = withLepper(cwd, (store) =>
      checkRules(cwd, store, str(params, 'path') || undefined),
    );
    return textResult(
      {
        summary: formatCheck(report),
        ...report,
      },
      !report.ok,
    );
  },
};
