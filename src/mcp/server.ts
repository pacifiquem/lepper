import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from '../../package.json';
import { git } from '../utils/git';
import { takeMessage } from './framing';
import { str, textResult } from './params';
import { Framing, JsonRpcRequest } from './rpc';
import { callTool, toolSchemas } from './tools';

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
  'Record what you learn about this repository so later agents can find it. At the start of a session, call diary with action recall and follow keep and stop before you work. Use find and map before rereading notes. Use codemap to see what calls what, and blast before changing a file or symbol so you can see what depends on it. When you finish, call diary with action write: one line of work, what went well, and what went wrong. Use sync after clone, and again after recording, to merge notes and the diary with other clones through refs/lepper/notes.';

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

function pathResolve(input: string): string {
  const resolved = path.resolve(input.trim());
  try {
    return fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}

function toolCwd(): string {
  if (process.env.LEPPER_ROOT && process.env.LEPPER_ROOT.trim()) {
    return pathResolve(process.env.LEPPER_ROOT);
  }
  return projectRoot || process.cwd();
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
    respond(
      id,
      withResultType({ tools: toolSchemas() }, wantsModern(params), true),
    );
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
    let reading = true;
    while (reading && buffer.length > 0) {
      let taken: ReturnType<typeof takeMessage> = null;
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
        reading = false;
        continue;
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
