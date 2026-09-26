import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { clearGraphCacheMemory } from '../src/codemap/callgraph/cache';
import { buildGraph } from '../src/codemap/callgraph/graph';
import { codeMap } from '../src/codemap';
import { withLepper } from '../src/notes/session';
import { createGitRepo, createTempDir, git, removeTempDir } from './helpers';

const dirs: string[] = [];

afterEach(() => {
  clearGraphCacheMemory();
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

function cacheFiles(root: string): string[] {
  const base = path.join(root, '.git', 'lepper', 'graph');
  const found: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) {
      return;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        found.push(full);
      }
    }
  };
  walk(base);
  return found;
}

function readIndex(root: string): {
  files: Record<string, { hash: string; size: number; mtimeMs: number }>;
} {
  const indexPath = cacheFiles(root).find((file) =>
    file.endsWith(`${path.sep}index.json`),
  );
  if (!indexPath) {
    throw new Error('missing graph cache index');
  }
  return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
}

function factFile(root: string, hash: string): string {
  const file = cacheFiles(root).find((item) =>
    item.endsWith(`${path.sep}${hash}.json`),
  );
  if (!file) {
    throw new Error(`missing fact blob ${hash}`);
  }
  return file;
}

function callsOf(root: string, name: string): string[] {
  const symbol = codeMap(root).symbols.find((item) => item.name === name);
  return (symbol?.calls || []).map(
    (call) => `${call.path}#${call.name}:${call.confidence}`,
  );
}

describe('graph cache', () => {
  it('reuses unchanged files and reparses only the file that changed', () => {
    const root = createGitRepo();
    dirs.push(root);
    write(
      root,
      'src/a.js',
      `export function run() {
  return helper();
}
`,
    );
    write(
      root,
      'src/b.js',
      `export function helper() {
  return 1;
}
`,
    );

    const first = callsOf(root, 'run');
    expect(first).toEqual(['./src/b.js#helper:inferred']);
    const index = readIndex(root);
    const unchanged = factFile(root, index.files['./src/a.js'].hash);
    const stale = new Date('2020-01-01T00:00:00Z');
    fs.utimesSync(unchanged, stale, stale);

    write(
      root,
      'src/b.js',
      `export function helper() {
  return 2;
}

export function extra() {
  return 3;
}
`,
    );
    clearGraphCacheMemory();
    expect(callsOf(root, 'run')).toEqual(['./src/b.js#helper:inferred']);
    expect(
      codeMap(root).symbols.some((symbol) => symbol.name === 'extra'),
    ).toBe(true);

    const next = readIndex(root);
    expect(next.files['./src/a.js'].hash).toBe(index.files['./src/a.js'].hash);
    expect(next.files['./src/b.js'].hash).not.toBe(
      index.files['./src/b.js'].hash,
    );
    expect(fs.statSync(unchanged).mtimeMs).toBe(stale.getTime());
  });

  it('drops deleted files and inserts new files in scan order', () => {
    const root = createGitRepo();
    dirs.push(root);
    write(
      root,
      'src/b.js',
      `export function fromB() {
  return 1;
}
`,
    );
    write(
      root,
      'src/c.js',
      `export function run() {
  return helper();
}
`,
    );
    expect(callsOf(root, 'run')).toEqual([]);

    write(
      root,
      'src/a.js',
      `export function helper() {
  return 1;
}
`,
    );
    expect(callsOf(root, 'run').sort()).toEqual(['./src/a.js#helper:inferred']);
    expect(Object.keys(readIndex(root).files).sort()).toEqual([
      './src/a.js',
      './src/b.js',
      './src/c.js',
    ]);

    fs.unlinkSync(path.join(root, 'src', 'a.js'));
    clearGraphCacheMemory();
    expect(callsOf(root, 'run')).toEqual([]);
    expect(Object.keys(readIndex(root).files).sort()).toEqual([
      './src/b.js',
      './src/c.js',
    ]);
    expect(
      codeMap(root).symbols.some((symbol) => symbol.name === 'fromB'),
    ).toBe(true);
  });

  it('re-resolves unchanged callers when another file changes the match', () => {
    const root = createGitRepo();
    dirs.push(root);
    write(
      root,
      'src/a.js',
      `export function helper() {
  return 1;
}
`,
    );
    write(
      root,
      'src/c.js',
      `export function run() {
  return helper();
}
`,
    );

    expect(callsOf(root, 'run')).toEqual(['./src/a.js#helper:inferred']);
    const callerHash = readIndex(root).files['./src/c.js'].hash;
    const callerBlob = factFile(root, callerHash);
    const stale = new Date('2020-01-01T00:00:00Z');
    fs.utimesSync(callerBlob, stale, stale);

    write(
      root,
      'src/b.js',
      `export function helper() {
  return 2;
}
`,
    );
    const calls = callsOf(root, 'run').sort();
    expect(calls).toEqual([
      './src/a.js#helper:ambiguous',
      './src/b.js#helper:ambiguous',
    ]);
    expect(readIndex(root).files['./src/c.js'].hash).toBe(callerHash);
    expect(fs.statSync(callerBlob).mtimeMs).toBe(stale.getTime());
  });

  it('rebuilds from source when the cache index or a fact blob is unreadable', () => {
    const root = createGitRepo();
    dirs.push(root);
    write(
      root,
      'src/a.js',
      `export function helper() {
  return 1;
}
`,
    );
    buildGraph(root);
    const indexPath = cacheFiles(root).find((file) =>
      file.endsWith(`${path.sep}index.json`),
    );
    if (!indexPath) {
      throw new Error('missing graph cache index');
    }
    const hash = readIndex(root).files['./src/a.js'].hash;
    fs.writeFileSync(factFile(root, hash), '{');
    fs.writeFileSync(indexPath, '{');
    clearGraphCacheMemory();

    expect(buildGraph(root).filesScanned).toBe(1);
    expect(codeMap(root).symbols.map((symbol) => symbol.name)).toContain(
      'helper',
    );
    expect(readIndex(root).files['./src/a.js'].hash).toBeTruthy();
  });

  it('scans while the notes store lock is already held', () => {
    const root = createGitRepo();
    dirs.push(root);
    write(
      root,
      'src/a.js',
      `export function helper() {
  return 1;
}
`,
    );
    const scanned = withLepper(root, () => buildGraph(root).filesScanned);
    expect(scanned).toBe(1);
  });

  it('keeps parsed facts when a file is renamed without a content change', () => {
    const root = createGitRepo();
    dirs.push(root);
    write(
      root,
      'src/payments/retry.js',
      `export function charge(id) {
  return id;
}
`,
    );
    git(root, ['add', '.']);
    git(root, ['commit', '-m', 'add payments']);
    buildGraph(root);
    const before = readIndex(root);
    const hash = before.files['./src/payments/retry.js'].hash;
    const blob = factFile(root, hash);
    const stale = new Date('2020-01-01T00:00:00Z');
    fs.utimesSync(blob, stale, stale);

    git(root, ['mv', 'src/payments', 'src/billing']);
    clearGraphCacheMemory();
    const names = codeMap(root).symbols.map(
      (symbol) => `${symbol.path}#${symbol.name}`,
    );
    expect(names).toContain('./src/billing/retry.js#charge');
    const after = readIndex(root);
    expect(after.files['./src/payments/retry.js']).toBeUndefined();
    expect(after.files['./src/billing/retry.js'].hash).toBe(hash);
    expect(fs.statSync(blob).mtimeMs).toBe(stale.getTime());
  });

  it('keeps working outside a git repository', () => {
    const root = createTempDir();
    dirs.push(root);
    write(
      root,
      'src/a.js',
      `export function helper() {
  return 1;
}
`,
    );
    expect(codeMap(root).symbols.map((symbol) => symbol.name)).toContain(
      'helper',
    );
    expect(cacheFiles(root)).toEqual([]);
  });
});
