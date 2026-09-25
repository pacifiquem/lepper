import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import blastCommand from '../src/codemap/cli-blast';
import codeCommand from '../src/codemap/cli-codemap';
import { blastRadius, codeMap } from '../src/codemap';
import { callTool } from '../src/mcp';
import { createTempDir, removeTempDir } from './helpers';

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) {
    const dir = dirs.pop();
    if (dir) {
      removeTempDir(dir);
    }
  }
});

function write(root: string, relative: string, body: string): void {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, body);
}

function fixture(): string {
  const root = createTempDir();
  dirs.push(root);
  write(
    root,
    'src/auth.js',
    `export function issue(user) {
  return user;
}

export function check(header) {
  return header;
}
`,
  );
  write(
    root,
    'src/cache.js',
    `export function get(url) {
  const store = { get(key) { return key; } };
  return store.get(url);
}

export function set(url, body) {
  return { url, body };
}
`,
  );
  write(
    root,
    'src/http.js',
    `import { check, issue } from './auth';
import { get } from './cache';

export function handleLogin(req) {
  const ok = check(req.header);
  if (!ok) {
    return null;
  }
  const token = issue(req.user);
  return get('/session/' + token);
}
`,
  );
  write(
    root,
    'src/mint.js',
    `import { issue } from './auth';

export function mint(user) {
  return issue(user);
}
`,
  );
  write(
    root,
    'src/server.js',
    `import { handleLogin } from './http';

export function main() {
  return handleLogin({ header: 'h', user: 'ada' });
}
`,
  );
  write(
    root,
    'src/session.js',
    `import { check } from './auth';

export class Session {
  start(header) {
    return check(header);
  }
}
`,
  );
  return root;
}

describe('code map', () => {
  it('links imports and ignores method calls, comments, and strings', () => {
    const root = fixture();
    write(
      root,
      'src/notes.js',
      `export function note() {
  // check(header)
  const text = "function ghost() { check(1) }";
  return text;
}
`,
    );

    const map = codeMap(root);
    const byName = (file: string, name: string) =>
      map.symbols.find(
        (symbol) => symbol.path === file && symbol.name === name,
      );

    const handleLogin = byName('./src/http.js', 'handleLogin');
    expect(handleLogin?.calls.map((call) => call.name).sort()).toEqual([
      'check',
      'get',
      'issue',
    ]);
    expect(
      handleLogin?.calls.every((call) => call.confidence === 'resolved'),
    ).toBe(true);

    const check = byName('./src/auth.js', 'check');
    expect(check?.calledBy.map((call) => call.name).sort()).toEqual([
      'Session.start',
      'handleLogin',
    ]);

    expect(byName('./src/cache.js', 'get')?.calls).toEqual([]);
    expect(map.symbols.some((symbol) => symbol.name === 'ghost')).toBe(false);
    expect(byName('./src/notes.js', 'note')?.calls).toEqual([]);
    expect(
      byName('./src/server.js', 'main')?.calls.map((call) => call.name),
    ).toEqual(['handleLogin']);
  });

  it('prefers a local function over another file with the same name', () => {
    const root = createTempDir();
    dirs.push(root);
    write(
      root,
      'src/util.js',
      `export function format(value) {
  return value;
}
`,
    );
    write(
      root,
      'src/app.js',
      `function format(value) {
  return 'local ' + value;
}

export function run() {
  return format(1);
}
`,
    );

    const run = codeMap(root).symbols.find((symbol) => symbol.name === 'run');
    expect(run?.calls).toEqual([
      {
        name: 'format',
        path: './src/app.js',
        line: 1,
        confidence: 'resolved',
      },
    ]);
  });

  it('keeps an unresolved name ambiguous when several files define it', () => {
    const root = createTempDir();
    dirs.push(root);
    write(
      root,
      'src/a.js',
      `export function format(value) {
  return value;
}
`,
    );
    write(
      root,
      'src/b.js',
      `export function format(value) {
  return value;
}
`,
    );
    write(
      root,
      'src/c.js',
      `export function run() {
  return format(1);
}
`,
    );

    const run = codeMap(root).symbols.find((symbol) => symbol.name === 'run');
    expect(run?.calls).toHaveLength(2);
    expect(run?.calls.every((call) => call.confidence === 'ambiguous')).toBe(
      true,
    );
    expect(blastRadius(root, 'format').ambiguous).toBe(true);
    expect(blastRadius(root, 'src/a.js').ambiguous).toBe(false);
  });

  it('resolves a Python relative import to the Python file when a TypeScript file shares the name', () => {
    const root = createTempDir();
    dirs.push(root);
    write(
      root,
      'src/auth.ts',
      `export function check(header: string): boolean {
  return header.length > 0;
}
`,
    );
    write(
      root,
      'src/auth.py',
      `def check(header):
    return header
`,
    );
    write(
      root,
      'src/http.py',
      `from .auth import check

def handle(header):
    return check(header)
`,
    );

    const handle = codeMap(root).symbols.find(
      (symbol) => symbol.path === './src/http.py' && symbol.name === 'handle',
    );
    expect(handle?.calls.map((call) => call.path)).toEqual(['./src/auth.py']);
    expect(
      blastRadius(root, 'src/auth.py#check').dependents.map(
        (item) => item.name,
      ),
    ).toContain('handle');
  });

  it('follows CommonJS require and Python, Go, and Rust calls', () => {
    const root = createTempDir();
    dirs.push(root);
    write(
      root,
      'src/db.js',
      `function connect() {
  return [];
}

module.exports = { connect };
`,
    );
    write(
      root,
      'src/repo.js',
      `const db = require('./db');

function load() {
  return db.connect();
}

module.exports = { load };
`,
    );
    write(
      root,
      'py/db.py',
      `def connect():
    return []
`,
    );
    write(
      root,
      'py/service.py',
      `from .db import connect

def load():
    return connect()
`,
    );
    write(
      root,
      'go/demo.go',
      `package demo

func Connect() int {
    return 1
}

func Load() int {
    return Connect()
}
`,
    );
    write(
      root,
      'rs/demo.rs',
      `fn connect() {}

fn load() {
    connect();
}
`,
    );

    const map = codeMap(root);
    const calls = (name: string) =>
      map.symbols
        .find((symbol) => symbol.name === name)
        ?.calls.map((call) => call.name);

    expect(calls('load')).toEqual(['connect']);
    expect(
      map.symbols
        .find((symbol) => symbol.path === './src/repo.js')
        ?.calls.map((call) => `${call.path}#${call.name}`),
    ).toEqual(['./src/db.js#connect']);
    expect(calls('Load')).toEqual(['Connect']);
    const pyLoad = map.symbols.find(
      (symbol) => symbol.path === './py/service.py' && symbol.name === 'load',
    );
    expect(pyLoad?.calls.map((call) => call.path)).toEqual(['./py/db.py']);
  });
});

describe('typescript and ambiguous names', () => {
  it('keeps calls inside typed functions and arrows on that symbol', () => {
    const root = createTempDir();
    dirs.push(root);
    write(
      root,
      'src/auth.ts',
      `export function check(header: string): boolean {
  return header.length > 0;
}
`,
    );
    write(
      root,
      'src/http.ts',
      `import { check } from './auth';

export function handle(header: string): string {
  return check(header);
}

export const show = (header: string): string => check(header);
`,
    );

    const map = codeMap(root);
    const handle = map.symbols.find((symbol) => symbol.name === 'handle');
    const show = map.symbols.find((symbol) => symbol.name === 'show');
    expect(handle?.calls.map((call) => call.name)).toEqual(['check']);
    expect(show?.calls.map((call) => call.name)).toEqual(['check']);
    expect(
      blastRadius(root, 'src/auth.ts#check').dependents.map(
        (item) => item.name,
      ),
    ).toEqual(expect.arrayContaining(['handle', 'show']));
  });

  it('marks a bare Python call ambiguous when two files define the name', () => {
    const root = createTempDir();
    dirs.push(root);
    write(
      root,
      'py/other/format_a.py',
      `def format(value):
    return value
`,
    );
    write(
      root,
      'py/elsewhere/format_b.py',
      `def format(value):
    return value
`,
    );
    write(
      root,
      'py/other/run.py',
      `def run():
    return format(1)
`,
    );

    const run = codeMap(root).symbols.find((symbol) => symbol.name === 'run');
    expect(run?.calls.map((call) => call.path).sort()).toEqual([
      './py/elsewhere/format_b.py',
      './py/other/format_a.py',
    ]);
    expect(run?.calls.every((call) => call.confidence === 'ambiguous')).toBe(
      true,
    );
  });

  it('rejects a blast target outside the project', () => {
    const root = fixture();
    expect(() => blastRadius(root, '../evil.js')).toThrow(
      /outside the project/,
    );
  });
});

describe('blast radius', () => {
  it('returns direct callers, importers, and transitive dependents', () => {
    const root = fixture();
    const radius = blastRadius(root, 'src/auth.js#check');

    expect(radius.ambiguous).toBe(false);
    expect(radius.definitions.map((symbol) => symbol.qualified)).toEqual([
      'check',
    ]);
    const direct = radius.dependents.filter((item) => item.depth === 1);
    expect(direct.map((item) => item.name).sort()).toEqual([
      '(imports)',
      '(imports)',
      'Session.start',
      'handleLogin',
    ]);
    expect(radius.dependents.some((item) => item.name === 'mint')).toBe(false);
    expect(
      radius.dependents.some(
        (item) => item.name === 'main' && item.depth === 2,
      ),
    ).toBe(true);

    const shallow = blastRadius(root, 'check', 1);
    expect(shallow.dependents.some((item) => item.name === 'main')).toBe(false);

    const file = blastRadius(root, 'src/auth.js');
    expect(file.ambiguous).toBe(false);
    expect(file.definitions.map((symbol) => symbol.name).sort()).toEqual([
      'check',
      'issue',
    ]);
    expect(file.dependents.some((item) => item.path === './src/mint.js')).toBe(
      true,
    );
    expect(file.dependents.some((item) => item.name === 'main')).toBe(true);
  });

  it('rejects an empty target and a depth outside the allowed range', () => {
    const root = fixture();
    expect(() => blastRadius(root, '   ')).toThrow(/blast requires/);
    expect(() => blastRadius(root, 'check', 0)).toThrow(/depth/);
  });
});

describe('codemap and blast surfaces', () => {
  it('prints text from the CLI and answers the MCP tools', () => {
    const root = fixture();
    const logs: string[] = [];
    const spy = vi
      .spyOn(console, 'log')
      .mockImplementation((message?: unknown) => {
        logs.push(String(message ?? ''));
      });

    codeCommand({ cwd: root, path: 'src/server.js' });
    blastCommand({ cwd: root, target: 'src/cache.js#get', json: true });
    spy.mockRestore();

    expect(logs[0]).toMatch(/main/);
    expect(logs[0]).toMatch(/calls \.\/src\/http\.js#handleLogin:4\n/);
    expect(logs[0]).not.toMatch(/inferred|ambiguous/);
    const printed = JSON.parse(logs[1] || '{}') as {
      definitions?: Array<{ name: string }>;
      dependents?: Array<{ name: string }>;
    };
    expect(printed.definitions?.[0]?.name).toBe('get');
    expect(
      printed.dependents?.some((item) => item.name === 'handleLogin'),
    ).toBe(true);

    const mapped = callTool('codemap', { symbol: 'issue' }, root);
    expect(mapped.isError).toBeFalsy();
    expect(mapped.content[0]?.text).toMatch(/issue/);

    const blasted = callTool(
      'blast',
      { target: 'src/cache.js', depth: 2 },
      root,
    );
    expect(blasted.isError).toBeFalsy();
    expect(blasted.content[0]?.text).toMatch(/handleLogin/);

    const missing = callTool('blast', {}, root);
    expect(missing.isError).toBe(true);
  });

  it('does not treat a property call as a call to the function of the same name', () => {
    const root = createTempDir();
    dirs.push(root);
    write(
      root,
      'src/cache.js',
      `const store = new Map();

function get(url) {
  const hit = store.get(url);
  if (!hit) return undefined;
  store.delete(url);
  return hit.body;
}

function set(url, body) {
  store.set(url, body);
}

module.exports = { get, set };
`,
    );

    const map = codeMap(root);
    const get = map.symbols.find(
      (symbol) => symbol.path === './src/cache.js' && symbol.name === 'get',
    );
    expect(get).toBeTruthy();
    expect(get?.calls).toEqual([]);
    expect(get?.calledBy.every((call) => call.path !== './src/cache.js')).toBe(
      true,
    );
  });
});
