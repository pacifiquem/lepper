import path from 'path';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { pathToFileURL } from 'url';
import { afterEach, describe, expect, it } from 'vitest';
import { withLepper } from '../src/lib/api';
import { readIndex } from '../src/lib/store';
import { createGitRepo, createTempDir, mkdirp, removeTempDir } from './helpers';

interface Rpc {
  id?: string | number | null;
  method?: string;
  result?: Record<string, unknown>;
  error?: { code?: number; message?: string };
}

const dirs: string[] = [];
const clients: Client[] = [];

afterEach(() => {
  while (clients.length) {
    clients.pop()?.close();
  }
  while (dirs.length) {
    const dir = dirs.pop();
    if (dir) {
      removeTempDir(dir);
    }
  }
});

function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of [
    'LEPPER_ROOT',
    'LEPPER_AGENT',
    'GIT_DIR',
    'GIT_INDEX_FILE',
    'GIT_WORK_TREE',
    'GIT_COMMON_DIR',
    'GIT_PREFIX',
  ]) {
    delete env[key];
  }
  return env;
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

function takeFrame(buffer: Buffer): { message: Rpc; rest: Buffer } | null {
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
      return { message: {}, rest: buffer.slice(split.start) };
    }
    const length = Number(match[1]);
    if (buffer.length < split.start + length) {
      return null;
    }
    const body = buffer
      .slice(split.start, split.start + length)
      .toString('utf8');
    return {
      message: JSON.parse(body) as Rpc,
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
    return { message: {}, rest };
  }
  return { message: JSON.parse(line) as Rpc, rest };
}

class Client {
  readonly child: ChildProcessWithoutNullStreams;
  raw = '';
  stderr = '';
  private buffer = Buffer.alloc(0);
  private inbox: Rpc[] = [];
  private waiting: Array<(message: Rpc) => void> = [];

  constructor(cwd: string) {
    const bin = path.resolve(__dirname, '../compiled/bin/lepper-mcp.js');
    this.child = spawn(process.execPath, [bin], {
      cwd,
      env: cleanEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.stdout.on('data', (chunk: Buffer) => {
      this.raw += chunk.toString('utf8');
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.pump();
    });
    this.child.stderr.on('data', (chunk: Buffer) => {
      this.stderr += chunk.toString('utf8');
    });
  }

  private pump(): void {
    while (this.buffer.length > 0) {
      let taken: { message: Rpc; rest: Buffer } | null = null;
      try {
        taken = takeFrame(this.buffer);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${message}\nraw: ${this.raw}\nstderr: ${this.stderr}`);
      }
      if (!taken) {
        return;
      }
      this.buffer = taken.rest;
      if (
        taken.message.method == null &&
        taken.message.id == null &&
        taken.message.result == null &&
        taken.message.error == null
      ) {
        continue;
      }
      const waiter = this.waiting.shift();
      if (waiter) {
        waiter(taken.message);
      } else {
        this.inbox.push(taken.message);
      }
    }
  }

  sendNdjson(message: unknown): void {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  sendContentLength(message: unknown): void {
    const payload = Buffer.from(JSON.stringify(message), 'utf8');
    this.child.stdin.write(`Content-Length: ${payload.length}\r\n\r\n`);
    this.child.stdin.write(payload);
  }

  next(timeoutMs = 5000): Promise<Rpc> {
    const queued = this.inbox.shift();
    if (queued) {
      return Promise.resolve(queued);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `timed out waiting for MCP message\nraw: ${this.raw}\nstderr: ${this.stderr}`,
          ),
        );
      }, timeoutMs);
      this.waiting.push((message) => {
        clearTimeout(timer);
        resolve(message);
      });
    });
  }

  close(): void {
    this.child.kill();
  }
}

function openClient(cwd: string): Client {
  const client = new Client(cwd);
  clients.push(client);
  return client;
}

const MODERN_META = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name: 'lepper-test', version: '1' },
  'io.modelcontextprotocol/clientCapabilities': {},
};

describe('MCP stdio', () => {
  it('speaks newline JSON to a modern client and records a note', async () => {
    const cwd = createGitRepo();
    dirs.push(cwd);
    mkdirp(cwd, 'src/cache');
    const client = openClient(cwd);

    client.sendNdjson({
      jsonrpc: '2.0',
      id: 'discover-1',
      method: 'server/discover',
      params: { _meta: MODERN_META },
    });
    const discovered = await client.next();
    expect(discovered.error).toBeUndefined();
    expect(discovered.result?.resultType).toBe('complete');
    expect(discovered.result?.supportedVersions).toEqual(['2026-07-28']);
    expect(discovered.result?.ttlMs).toBeGreaterThan(0);
    expect(client.raw.startsWith('{')).toBe(true);
    expect(client.raw).not.toMatch(/Content-Length/);

    client.sendNdjson({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: { _meta: MODERN_META },
    });
    const listed = await client.next();
    const tools = listed.result?.tools as Array<{ name: string }>;
    expect(tools.map((tool) => tool.name)).toContain('sync');
    expect(listed.result?.resultType).toBe('complete');
    expect(listed.result?.cacheScope).toBe('public');
    expect(listed.result?.ttlMs).toBeGreaterThan(0);

    client.sendNdjson({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'record',
        arguments: {
          path: 'src/cache',
          note: 'In-memory cache expires in five minutes. Entry is store.ts',
          agent: 'stdio',
        },
        _meta: MODERN_META,
      },
    });
    const recorded = await client.next();
    expect(recorded.error).toBeUndefined();
    expect(recorded.result?.isError).toBeFalsy();
    expect(String(recorded.result?.resultType)).toBe('complete');
    expect(client.raw).not.toMatch(/Content-Length/);

    const notes = withLepper(cwd, (store) => readIndex(store).notes);
    expect(notes['./src/cache']?.excerpt).toMatch(/store\.ts/);

    client.sendNdjson({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/list',
      params: {
        _meta: { 'io.modelcontextprotocol/protocolVersion': '1900-01-01' },
      },
    });
    const rejected = await client.next();
    expect(rejected.error?.code).toBe(-32022);
  });

  it('answers a Content-Length initialize in the same framing', async () => {
    const cwd = createGitRepo();
    dirs.push(cwd);
    const client = openClient(cwd);

    client.sendContentLength({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'legacy', version: '1' },
      },
    });
    const init = await client.next();
    expect(init.result?.protocolVersion).toBe('2024-11-05');
    expect(init.result?.resultType).toBeUndefined();
    expect(client.raw).toMatch(/Content-Length: \d+/);

    client.sendContentLength({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });
    const listed = await client.next();
    const tools = listed.result?.tools as Array<{ name: string }>;
    expect(tools.map((tool) => tool.name)).toContain('record');
    expect(listed.result?.resultType).toBeUndefined();
  });

  it('uses a legacy roots reply as the workspace', async () => {
    const repo = createGitRepo();
    dirs.push(repo);
    mkdirp(repo, 'src/cache');
    const outside = createTempDir();
    dirs.push(outside);
    const client = openClient(outside);

    client.sendNdjson({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: { roots: { listChanged: true } },
        clientInfo: { name: 'roots', version: '1' },
      },
    });
    const init = await client.next();
    expect(init.result?.protocolVersion).toBe('2025-03-26');

    client.sendNdjson({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    client.sendNdjson({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'record',
        arguments: {
          path: 'src/cache',
          note: 'recorded via roots',
          agent: 'roots',
        },
      },
    });

    const roots = await client.next();
    expect(roots.method).toBe('roots/list');
    client.sendNdjson({
      jsonrpc: '2.0',
      id: roots.id,
      result: {
        roots: [{ uri: pathToFileURL(repo).href, name: 'repo' }],
      },
    });

    const recorded = await client.next();
    expect(recorded.id).toBe(2);
    expect(recorded.error).toBeUndefined();
    expect(recorded.result?.isError).toBeFalsy();
    const notes = withLepper(repo, (store) => readIndex(store).notes);
    expect(notes['./src/cache']?.excerpt).toMatch(/recorded via roots/);
  });
});
