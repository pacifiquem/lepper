import { codeMap, formatCodeMap } from '../../codemap';
import { str, textResult } from '../params';
import { McpTool, readOnly } from './types';

export const codemapTool: McpTool = {
  name: 'codemap',
  description:
    'Read the source tree and return a map of what calls what. Covers JavaScript, TypeScript, Python, Java, C, C++, C#, SQL, Bash, PowerShell, HTML, CSS, Go, Rust, Elixir, and Erlang. Optional path focuses a file or directory. Optional symbol focuses one function, method, or class.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Optional file or directory to focus',
      },
      symbol: {
        type: 'string',
        description: 'Optional function, method, or class name',
      },
    },
  },
  annotations: readOnly,
  call(params, cwd) {
    const map = codeMap(cwd, {
      path: str(params, 'path') || undefined,
      symbol: str(params, 'symbol') || undefined,
    });
    return textResult({
      map: formatCodeMap(map),
      ...map,
    });
  },
};
