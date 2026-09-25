import { projectCwd } from '../../utils/git';
import { textResult, ToolResult } from '../params';
import { blastTool } from './blast';
import { preflightTool } from './preflight';
import { codemapTool } from './codemap';
import { diaryTool } from './diary';
import { findTool } from './find';
import { mapTool } from './map';
import { recordTool } from './record';
import { syncTool } from './sync';
import { todoTool } from './todo';
import { McpTool, ToolSchema } from './types';

const tools: McpTool[] = [
  preflightTool,
  recordTool,
  mapTool,
  codemapTool,
  blastTool,
  findTool,
  diaryTool,
  todoTool,
  syncTool,
];

export function toolSchemas(): ToolSchema[] {
  return tools.map(({ name, description, inputSchema, annotations }) => ({
    name,
    description,
    inputSchema,
    ...(annotations ? { annotations } : {}),
  }));
}

export function callTool(
  name: string,
  params: Record<string, unknown> = {},
  cwd: string = projectCwd(),
): ToolResult {
  const tool = tools.find((item) => item.name === name);
  if (!tool) {
    return textResult(`Unknown tool: ${name}`, true);
  }
  try {
    return tool.call(params, cwd);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return textResult(message, true);
  }
}
