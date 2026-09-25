import { blastRadius, formatBlast } from '../../codemap';
import { num, str, textResult } from '../params';
import { McpTool, readOnly } from './types';

export const blastTool: McpTool = {
  name: 'blast',
  description:
    'Return the blast radius of a file or symbol: what calls it, what imports it, and the transitive dependents. Ask for this before changing code so a breaking change is visible. Target is a file, a symbol name, or path#symbol.',
  inputSchema: {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        description:
          'File path, symbol name, or path#symbol. Example: src/cache.js#get',
      },
      depth: {
        type: 'number',
        description: 'How many caller hops to follow. Default 4.',
      },
    },
    required: ['target'],
  },
  annotations: readOnly,
  call(params, cwd) {
    const result = blastRadius(
      cwd,
      str(params, 'target'),
      num(params, 'depth'),
    );
    return textResult({
      summary: formatBlast(result),
      ...result,
    });
  },
};
