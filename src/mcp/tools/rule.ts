import { withLepper } from '../../notes/session';
import { addRule, listRules, removeRule } from '../../rules/rules';
import { str, textResult } from '../params';
import { McpTool } from './types';

export const ruleTool: McpTool = {
  name: 'rule',
  description:
    'Record an architecture contract: files under `from` must not import or call `to`. Actions: add, list, remove. Check them with the check tool.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['add', 'list', 'remove'],
        description: 'Rule action. Defaults to list.',
      },
      from: {
        type: 'string',
        description: 'Path that must not depend on `to`.',
      },
      to: {
        type: 'string',
        description: 'Path that `from` must not import or call.',
      },
      note: {
        type: 'string',
        description: 'Why the boundary exists.',
      },
      id: { type: 'string', description: 'Rule id for remove.' },
      agent: { type: 'string', description: 'Optional agent name.' },
    },
  },
  call(params, cwd) {
    const action = str(params, 'action') || 'list';
    const payload = withLepper(cwd, (store) => {
      if (action === 'add') {
        return addRule(store, {
          from: str(params, 'from'),
          to: str(params, 'to'),
          note: str(params, 'note') || undefined,
          agent: str(params, 'agent') || undefined,
        });
      }
      if (action === 'remove') {
        return removeRule(store, str(params, 'id'));
      }
      return listRules(store);
    });
    return textResult(payload);
  },
};
