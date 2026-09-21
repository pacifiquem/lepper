import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { withLepper } from '../lib/api';
import { git, projectCwd } from '../lib/git';
import { formatMap, projectMap } from '../lib/map';
import { getNote, historyFor, recordNote } from '../lib/notes';
import { findNotes } from '../lib/search';
import { normalizeProjectPath } from '../lib/paths';
import { syncNotes } from '../lib/sync';
import { addTodo, completeTodo, listTodos, startTodo } from '../lib/todos';
import pkg from '../../package.json';

const MODERN_PROTOCOL_VERSION = '2026-07-28';
const LEGACY_PROTOCOL_VERSIONS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
  '2024-10-07',
];
const SUPPORTED_PROTOCOL_VERSIONS = [
  MODERN_PROTOCOL_VERSION,
  ...LEGACY_PROTOCOL_VERSIONS,
];
const INSTRUCTIONS =
  'Record what you learn about this repository so later agents can find it. Use find and map before rereading code. Use sync after clone, and again after recording, to merge notes with other clones through refs/lepper/notes.';

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: unknown;
}

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

type Framing = 'ndjson' | 'content-length';

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

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

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
    annotations: readOnly,
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
    annotations: readOnly,
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
  {
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

let outputFraming: Framing = 'ndjson';
let framingLocked = false;
let sessionModern = false;
let clientRoots = false;
let projectRoot: string | undefined;
let requestSerial = 0;
let rootsReady: Promise<void> = Promise.resolve();
const pending = new Map<string, (result: unknown) => void>();

function hasId(id: string | number | null | undefined): id is string | number {
  return id !== undefined && id !== null;
}

function respond(
  id: string | number | null | undefined,
  result: unknown,
): void {
  if (!hasId(id)) {
    return;
  }
  writeMessage({ jsonrpc: '2.0', id, result });
}

function respondError(
  id: string | number | null | undefined,
  code: number,
  message: string,
  data?: unknown,
): void {
  if (!hasId(id)) {
    return;
  }
  writeMessage({
    jsonrpc: '2.0',
    id,
    error: data === undefined ? { code, message } : { code, message, data },
  });
}

function writeMessage(message: unknown): void {
  const json = JSON.stringify(message);
  if (outputFraming === 'content-length') {
    const payload = Buffer.from(json, 'utf8');
    process.stdout.write(`Content-Length: ${payload.length}\r\n\r\n`);
    process.stdout.write(payload);
    return;
  }
  process.stdout.write(`${json}\n`);
}

function negotiateLegacy(requested: string): string {
  if (
    requested === MODERN_PROTOCOL_VERSION ||
    LEGACY_PROTOCOL_VERSIONS.includes(requested)
  ) {
    return requested;
  }
  return LEGACY_PROTOCOL_VERSIONS[0];
}

function metaVersion(params: Record<string, unknown> | undefined): string {
  const meta = params?._meta;
  if (!meta || typeof meta !== 'object') {
    return '';
  }
  const version = (meta as Record<string, unknown>)[
    'io.modelcontextprotocol/protocolVersion'
  ];
  return typeof version === 'string' ? version : '';
}

function wantsModern(params: Record<string, unknown> | undefined): boolean {
  const version = metaVersion(params);
  if (version === MODERN_PROTOCOL_VERSION) {
    sessionModern = true;
    return true;
  }
  if (version && LEGACY_PROTOCOL_VERSIONS.includes(version)) {
    return false;
  }
  return sessionModern;
}

function rejectUnsupported(
  id: string | number | null | undefined,
  params: Record<string, unknown>,
): boolean {
  const version = metaVersion(params);
  if (
    !version ||
    version === MODERN_PROTOCOL_VERSION ||
    LEGACY_PROTOCOL_VERSIONS.includes(version)
  ) {
    return false;
  }
  respondError(id, -32022, 'Unsupported protocol version', {
    supported: SUPPORTED_PROTOCOL_VERSIONS,
    requested: version,
  });
  return true;
}

function withResultType(
  result: Record<string, unknown>,
  modern: boolean,
  cacheable = false,
): Record<string, unknown> {
  if (!modern) {
    return result;
  }
  return {
    ...result,
    resultType: 'complete',
    ...(cacheable ? { ttlMs: 3_600_000, cacheScope: 'public' as const } : {}),
  };
}

function toolArguments(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const value = params.arguments;
  if (typeof value === 'string' && value.trim()) {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toolCwd(): string {
  if (process.env.LEPPER_ROOT && process.env.LEPPER_ROOT.trim()) {
    return pathResolve(process.env.LEPPER_ROOT);
  }
  return projectRoot || process.cwd();
}

function pathResolve(input: string): string {
  const resolved = path.resolve(input.trim());
  try {
    return fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}

function applyRoots(result: unknown): void {
  const roots = (result as { roots?: Array<{ uri?: string }> } | undefined)
    ?.roots;
  if (!Array.isArray(roots)) {
    return;
  }

  const candidates: string[] = [];
  for (const root of roots) {
    if (!root?.uri) {
      continue;
    }
    try {
      candidates.push(fileURLToPath(root.uri));
    } catch {
      // Ignore roots that are not file URLs.
    }
  }

  for (const candidate of candidates) {
    if (git(candidate, ['rev-parse', '--show-toplevel']).status === 0) {
      projectRoot = candidate;
      return;
    }
  }
  if (candidates[0]) {
    projectRoot = candidates[0];
  }
}

function requestRoots(): void {
  if (sessionModern || !clientRoots || (process.env.LEPPER_ROOT || '').trim()) {
    return;
  }

  rootsReady = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(), 2000);
    const id = ++requestSerial;
    pending.set(String(id), (result) => {
      clearTimeout(timer);
      applyRoots(result);
      resolve();
    });
    writeMessage({
      jsonrpc: '2.0',
      id,
      method: 'roots/list',
      params: {},
    });
  });
}

async function handle(message: JsonRpcRequest): Promise<void> {
  if (message.method == null && hasId(message.id)) {
    const waiter = pending.get(String(message.id));
    if (waiter) {
      pending.delete(String(message.id));
      waiter(message.result);
    }
    return;
  }

  const method = message.method || '';
  const id = message.id;
  const params = message.params || {};
  const legacyHandshake =
    method === 'initialize' ||
    method === 'initialized' ||
    method.startsWith('notifications/');
  if (!legacyHandshake && rejectUnsupported(id, params)) {
    return;
  }

  if (method === 'initialize') {
    const requested = str(params, 'protocolVersion');
    const protocolVersion = negotiateLegacy(requested);
    sessionModern = protocolVersion === MODERN_PROTOCOL_VERSION;
    const capabilities = params.capabilities;
    clientRoots = Boolean(
      capabilities &&
        typeof capabilities === 'object' &&
        (capabilities as { roots?: unknown }).roots,
    );
    respond(id, {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'lepper', version: pkg.version },
      instructions: INSTRUCTIONS,
    });
    return;
  }

  if (method === 'server/discover') {
    sessionModern = true;
    respond(id, {
      resultType: 'complete',
      supportedVersions: [MODERN_PROTOCOL_VERSION],
      capabilities: { tools: {} },
      instructions: INSTRUCTIONS,
      ttlMs: 3_600_000,
      cacheScope: 'public',
      _meta: {
        'io.modelcontextprotocol/serverInfo': {
          name: 'lepper',
          version: pkg.version,
        },
      },
    });
    return;
  }

  if (method === 'notifications/initialized' || method === 'initialized') {
    requestRoots();
    if (hasId(id)) {
      respond(id, {});
    }
    return;
  }

  if (method === 'notifications/roots/list_changed') {
    requestRoots();
    return;
  }

  if (method === 'ping') {
    respond(id, withResultType({}, wantsModern(params)));
    return;
  }

  if (method === 'logging/setLevel') {
    respond(id, withResultType({}, wantsModern(params)));
    return;
  }

  if (method === 'tools/list') {
    respond(id, withResultType({ tools: TOOLS }, wantsModern(params), true));
    return;
  }

  if (method === 'resources/list') {
    respond(id, withResultType({ resources: [] }, wantsModern(params), true));
    return;
  }

  if (method === 'resources/templates/list') {
    respond(
      id,
      withResultType({ resourceTemplates: [] }, wantsModern(params), true),
    );
    return;
  }

  if (method === 'prompts/list') {
    respond(id, withResultType({ prompts: [] }, wantsModern(params), true));
    return;
  }

  if (method === 'tools/call') {
    await rootsReady;
    const modern = wantsModern(params);
    try {
      const result = callTool(
        str(params, 'name'),
        toolArguments(params),
        toolCwd(),
      );
      respond(id, withResultType({ ...result }, modern));
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      respond(id, withResultType({ ...textResult(text, true) }, modern));
    }
    return;
  }

  if (method.startsWith('notifications/')) {
    return;
  }

  respondError(id, -32601, `Method not found: ${method}`);
}

interface Taken {
  message: JsonRpcRequest;
  framing: Framing;
  rest: Buffer;
}

function headerSplit(buffer: Buffer): { header: string; start: number } | null {
  const crlf = buffer.indexOf('\r\n\r\n');
  const lf = buffer.indexOf('\n\n');
  if (crlf === -1 && lf === -1) {
    return null;
  }
  if (crlf !== -1 && (lf === -1 || crlf <= lf)) {
    return {
      header: buffer.slice(0, crlf).toString('utf8'),
      start: crlf + 4,
    };
  }
  return {
    header: buffer.slice(0, lf).toString('utf8'),
    start: lf + 2,
  };
}

function takeMessage(buffer: Buffer): Taken | null {
  const preview = buffer
    .slice(0, 80)
    .toString('utf8')
    .trimStart()
    .toLowerCase();
  if (
    preview.startsWith('content-length:') ||
    preview.startsWith('content-type:')
  ) {
    const split = headerSplit(buffer);
    if (!split) {
      return null;
    }
    const match = split.header.match(/content-length:\s*(\d+)/i);
    if (!match) {
      return {
        message: { method: '' },
        framing: 'content-length',
        rest: buffer.slice(split.start),
      };
    }
    const length = Number(match[1]);
    if (buffer.length < split.start + length) {
      return null;
    }
    const body = buffer
      .slice(split.start, split.start + length)
      .toString('utf8');
    return {
      message: JSON.parse(body) as JsonRpcRequest,
      framing: 'content-length',
      rest: buffer.slice(split.start + length),
    };
  }

  const nl = buffer.indexOf(0x0a);
  if (nl === -1) {
    return null;
  }
  const line = buffer.slice(0, nl).toString('utf8').replace(/\r$/, '').trim();
  const rest = buffer.slice(nl + 1);
  if (!line) {
    return { message: { method: '' }, framing: 'ndjson', rest };
  }
  return {
    message: JSON.parse(line) as JsonRpcRequest,
    framing: 'ndjson',
    rest,
  };
}

export async function startMcpServer(): Promise<void> {
  let buffer = Buffer.alloc(0);
  let handlers = Promise.resolve();

  const enqueue = (message: JsonRpcRequest): void => {
    if (message.method == null && hasId(message.id)) {
      const waiter = pending.get(String(message.id));
      if (waiter) {
        pending.delete(String(message.id));
        waiter(message.result);
      }
      return;
    }

    const id = message.id;
    handlers = handlers
      .then(() => handle(message))
      .catch((error) => {
        const text = error instanceof Error ? error.message : String(error);
        process.stderr.write(`${text}\n`);
        respondError(id, -32603, text);
      });
  };

  const drain = (): void => {
    while (buffer.length > 0) {
      let taken: Taken | null = null;
      try {
        taken = takeMessage(buffer);
      } catch (error) {
        const nl = buffer.indexOf(0x0a);
        buffer = nl === -1 ? Buffer.alloc(0) : buffer.slice(nl + 1);
        const text = error instanceof Error ? error.message : String(error);
        process.stderr.write(`${text}\n`);
        continue;
      }
      if (!taken) {
        return;
      }
      buffer = taken.rest;
      if (!taken.message.method && taken.message.id == null) {
        continue;
      }
      if (!framingLocked) {
        if (taken.framing === 'content-length') {
          outputFraming = 'content-length';
        }
        framingLocked = true;
      }
      enqueue(taken.message);
    }
  };

  process.stdin.on('data', (chunk: Buffer | string) => {
    const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    buffer = Buffer.concat([buffer, next]);
    try {
      drain();
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${text}\n`);
    }
  });

  process.stdin.on('end', () => {
    try {
      drain();
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${text}\n`);
    }
    void handlers.then(() => process.exit(0));
  });

  process.stdin.resume();
}
