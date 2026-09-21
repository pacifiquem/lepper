import { withLepper } from '../lib/api';
import { formatMap, projectMap } from '../lib/map';
import { getNote, historyFor, recordNote } from '../lib/notes';
import { findNotes } from '../lib/search';
import { addTodo, completeTodo, listTodos, startTodo } from '../lib/todos';
import { syncNotes } from '../lib/sync';
import { normalizeProjectPath } from '../lib/paths';
import { projectCwd } from '../lib/git';
import pkg from '../../package.json';

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

function textResult(value: unknown, isError = false): ToolResult {
  const text =
    typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: 'text', text }], isError };
}

function str(params: Record<string, unknown> | undefined, key: string): string {
  const value = params?.[key];
  return value == null ? '' : String(value);
}

function num(
  params: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = params?.[key];
  if (value == null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function tagsOf(params: Record<string, unknown> | undefined): string[] {
  const value = params?.tags;
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((item) => item.trim());
  }
  return [];
}

const TOOLS = [
  {
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
  },
  {
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
  },
  {
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
  },
  {
    name: 'todo',
    description:
      'Share work-in-progress with other agents on this repo. Actions: add, list, start, done.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'list', 'start', 'claim', 'done'],
          description: 'Todo action',
        },
        title: { type: 'string', description: 'Title for add' },
        body: { type: 'string', description: 'Optional details for add' },
        id: { type: 'string', description: 'Todo id for start or done' },
        status: {
          type: 'string',
          enum: ['open', 'doing', 'done'],
          description: 'Optional list filter',
        },
        agent: { type: 'string', description: 'Optional agent name' },
      },
      required: ['action'],
    },
  },
];

export function callTool(
  name: string,
  params: Record<string, unknown> = {},
  cwd: string = projectCwd(),
): ToolResult {
  try {
    if (name === 'record') {
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
    }

    if (name === 'map') {
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
    }

    if (name === 'find') {
      const hits = withLepper(cwd, (store) =>
        findNotes(store, {
          query: str(params, 'query'),
          path: str(params, 'path') || undefined,
          limit: num(params, 'limit'),
        }),
      );
      return textResult({ hits });
    }

    if (name === 'todo') {
      const action = str(params, 'action') || 'list';
      const payload = withLepper(cwd, (store) => {
        if (action === 'add') {
          return addTodo(store, {
            title: str(params, 'title'),
            body: str(params, 'body') || undefined,
            agent: str(params, 'agent') || undefined,
          });
        }
        if (action === 'start' || action === 'claim') {
          return startTodo(
            store,
            str(params, 'id'),
            str(params, 'agent') || undefined,
          );
        }
        if (action === 'done') {
          return completeTodo(
            store,
            str(params, 'id'),
            str(params, 'agent') || undefined,
          );
        }
        return listTodos(
          store,
          str(params, 'status') as 'open' | 'doing' | 'done' | undefined,
        );
      });
      return textResult(payload);
    }

    if (name === 'sync') {
      const result = withLepper(cwd, (store) => syncNotes(store.root));
      return textResult(result);
    }

    return textResult(`Unknown tool: ${name}`, true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return textResult(message, true);
  }
}

function respond(
  id: string | number | null | undefined,
  result: unknown,
): void {
  if (id === undefined) {
    return;
  }
  writeMessage({ jsonrpc: '2.0', id, result });
}

function respondError(
  id: string | number | null | undefined,
  message: string,
): void {
  if (id === undefined) {
    return;
  }
  writeMessage({
    jsonrpc: '2.0',
    id,
    error: { code: -32000, message },
  });
}

function writeMessage(message: unknown): void {
  const json = JSON.stringify(message);
  const payload = Buffer.from(json, 'utf8');
  process.stdout.write(`Content-Length: ${payload.length}\r\n\r\n`);
  process.stdout.write(payload);
}

function handle(message: JsonRpcRequest): void {
  const method = message.method || '';
  const id = message.id;
  const params = message.params || {};

  if (method === 'initialize') {
    respond(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'lepper', version: pkg.version },
    });
    return;
  }

  if (method === 'notifications/initialized' || method === 'initialized') {
    return;
  }

  if (method === 'ping') {
    respond(id, {});
    return;
  }

  if (method === 'tools/list') {
    respond(id, { tools: TOOLS });
    return;
  }

  if (method === 'tools/call') {
    const name = str(params, 'name');
    const args =
      params.arguments && typeof params.arguments === 'object'
        ? (params.arguments as Record<string, unknown>)
        : {};
    const result = callTool(name, args);
    respond(id, result);
    return;
  }

  if (method.startsWith('notifications/')) {
    return;
  }

  respondError(id, `Unknown method: ${method}`);
}

function consume(buffer: Buffer): Buffer {
  while (buffer.length > 0) {
    const headerSep = buffer.indexOf('\r\n\r\n');
    const asString = buffer.toString('utf8');

    if (
      headerSep !== -1 &&
      /content-length:/i.test(asString.slice(0, headerSep))
    ) {
      const header = buffer.slice(0, headerSep).toString('utf8');
      const match = header.match(/content-length:\s*(\d+)/i);
      if (!match) {
        break;
      }
      const length = Number(match[1]);
      const start = headerSep + 4;
      if (buffer.length < start + length) {
        break;
      }
      const body = buffer.slice(start, start + length).toString('utf8');
      handle(JSON.parse(body) as JsonRpcRequest);
      buffer = buffer.slice(start + length);
      continue;
    }

    const nl = buffer.indexOf(0x0a);
    if (nl === -1) {
      break;
    }
    const line = buffer.slice(0, nl).toString('utf8').trim();
    buffer = buffer.slice(nl + 1);
    if (!line) {
      continue;
    }
    handle(JSON.parse(line) as JsonRpcRequest);
  }

  return buffer;
}

export async function startMcpServer(): Promise<void> {
  process.stdin.setEncoding('utf8');
  let buffer = Buffer.alloc(0);

  process.stdin.on('data', (chunk: string | Buffer) => {
    buffer = Buffer.concat([
      buffer,
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8'),
    ]);
    try {
      buffer = consume(buffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
    }
  });

  process.stdin.on('end', () => {
    process.exit(0);
  });
}
