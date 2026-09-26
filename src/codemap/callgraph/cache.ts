import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { parseSource } from '../languages/registry';
import { CliError } from '../../utils/errors';
import { resolveGit } from '../../utils/git';
import { withStoreLock } from '../../utils/lock';
import type { Binding, FileFacts, Graph } from './types';

/**
 * Bump when a parser or the cached fact shape changes. Older fact blobs are
 * left unread so a parse change cannot be served as current.
 */
export const GRAPH_CACHE_VERSION = 1;

interface CacheEntry {
  hash: string;
  size: number;
  mtimeMs: number;
}

interface CacheIndex {
  version: number;
  root: string;
  files: Record<string, CacheEntry>;
}

interface CacheLocation {
  root: string;
  lockDir: string;
  dir: string;
}

interface GatheredFacts {
  facts: FileFacts[];
  signature: string;
  dirty: boolean;
  index: CacheIndex;
}

const factsByHash = new Map<string, FileFacts>();
const graphs = new Map<string, { signature: string; graph: Graph }>();
const locations = new Map<string, CacheLocation | null>();

export function clearGraphCacheMemory(): void {
  factsByHash.clear();
  graphs.clear();
  locations.clear();
}

function emptyIndex(root: string): CacheIndex {
  return { version: GRAPH_CACHE_VERSION, root, files: {} };
}

function cloneFacts(file: FileFacts): FileFacts {
  return {
    path: file.path,
    symbols: file.symbols.map((symbol) => ({ ...symbol })),
    calls: file.calls.map((call) => ({ ...call })),
    bindings: new Map(file.bindings),
    exports: file.exports.map((item) => ({ ...item })),
    imports: file.imports.map((item) => ({
      spec: item.spec,
      line: item.line,
      names: item.names.slice(),
    })),
  };
}

function contentHash(filePath: string, source: string): string {
  return createHash('sha256')
    .update(String(GRAPH_CACHE_VERSION))
    .update('\0')
    .update(path.posix.extname(filePath).toLowerCase())
    .update('\0')
    .update(source)
    .digest('hex');
}

function identityOf(root: string): string {
  try {
    return fs.realpathSync(root);
  } catch {
    return path.resolve(root);
  }
}

function locate(root: string): CacheLocation | null {
  const resolved = path.resolve(root);
  if (locations.has(resolved)) {
    return locations.get(resolved) || null;
  }

  try {
    const git = resolveGit(root);
    const realRoot = identityOf(root);
    const key = createHash('sha256').update(realRoot).digest('hex');
    const lockDir = path.join(git.commonGitDir, 'lepper', 'graph');
    const location = {
      root: realRoot,
      lockDir,
      dir: path.join(lockDir, `v${GRAPH_CACHE_VERSION}`, key),
    };
    locations.set(resolved, location);
    return location;
  } catch {
    locations.set(resolved, null);
    return null;
  }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value)}\n`);
  fs.renameSync(tmp, file);
}

function readIndex(dir: string, root: string): CacheIndex {
  const file = path.join(dir, 'index.json');
  if (!fs.existsSync(file)) {
    return emptyIndex(root);
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as CacheIndex;
    if (
      !parsed ||
      parsed.version !== GRAPH_CACHE_VERSION ||
      parsed.root !== root ||
      !parsed.files ||
      typeof parsed.files !== 'object'
    ) {
      return emptyIndex(root);
    }
    const files: Record<string, CacheEntry> = {};
    for (const [filePath, entry] of Object.entries(parsed.files)) {
      if (
        entry &&
        typeof entry.hash === 'string' &&
        typeof entry.size === 'number' &&
        typeof entry.mtimeMs === 'number'
      ) {
        files[filePath] = entry;
      }
    }
    return { version: GRAPH_CACHE_VERSION, root, files };
  } catch {
    return emptyIndex(root);
  }
}

function factPath(dir: string, hash: string): string {
  return path.join(dir, 'facts', `${hash}.json`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function factsFromStored(filePath: string, value: unknown): FileFacts | null {
  if (!isRecord(value) || !Array.isArray(value.symbols)) {
    return null;
  }
  if (!Array.isArray(value.calls) || !Array.isArray(value.bindings)) {
    return null;
  }
  if (!Array.isArray(value.exports) || !Array.isArray(value.imports)) {
    return null;
  }

  const bindings = new Map<string, Binding>();
  for (const pair of value.bindings) {
    if (
      !Array.isArray(pair) ||
      typeof pair[0] !== 'string' ||
      !isRecord(pair[1])
    ) {
      return null;
    }
    const binding = pair[1];
    if (
      typeof binding.spec !== 'string' ||
      typeof binding.imported !== 'string' ||
      typeof binding.line !== 'number'
    ) {
      return null;
    }
    bindings.set(pair[0], {
      spec: binding.spec,
      imported: binding.imported,
      line: binding.line,
    });
  }

  return {
    path: filePath,
    symbols: value.symbols as FileFacts['symbols'],
    calls: value.calls as FileFacts['calls'],
    bindings,
    exports: value.exports as FileFacts['exports'],
    imports: value.imports as FileFacts['imports'],
  };
}

function loadFacts(
  dir: string | null,
  hash: string,
  filePath: string,
): FileFacts | null {
  const cached = factsByHash.get(hash);
  if (cached) {
    return cloneFacts({ ...cached, path: filePath });
  }
  if (!dir) {
    return null;
  }

  const file = factPath(dir, hash);
  if (!fs.existsSync(file)) {
    return null;
  }

  try {
    const restored = factsFromStored(
      filePath,
      JSON.parse(fs.readFileSync(file, 'utf8')),
    );
    if (!restored) {
      return null;
    }
    factsByHash.set(hash, cloneFacts(restored));
    return cloneFacts(restored);
  } catch {
    return null;
  }
}

function storeFacts(dir: string, hash: string, facts: FileFacts): void {
  const pristine = cloneFacts(facts);
  factsByHash.set(hash, pristine);
  writeJson(factPath(dir, hash), {
    symbols: pristine.symbols,
    calls: pristine.calls,
    bindings: Array.from(pristine.bindings.entries()),
    exports: pristine.exports,
    imports: pristine.imports,
  });
}

function rememberFacts(hash: string, facts: FileFacts): FileFacts {
  const pristine = cloneFacts(facts);
  factsByHash.set(hash, pristine);
  return cloneFacts(pristine);
}

function pruneFacts(dir: string, keep: Set<string>): void {
  const factsDir = path.join(dir, 'facts');
  if (!fs.existsSync(factsDir)) {
    return;
  }
  for (const name of fs.readdirSync(factsDir)) {
    if (!name.endsWith('.json')) {
      continue;
    }
    const hash = name.slice(0, -'.json'.length);
    if (keep.has(hash)) {
      continue;
    }
    fs.unlinkSync(path.join(factsDir, name));
  }
}

function signatureFor(
  truncated: boolean,
  parts: Array<{ path: string; hash: string }>,
): string {
  return [
    GRAPH_CACHE_VERSION,
    truncated ? '1' : '0',
    ...parts.map((part) => `${part.path}\0${part.hash}`),
  ].join('\n');
}

function gather(
  root: string,
  collected: { files: string[]; truncated: boolean },
  location: CacheLocation | null,
): GatheredFacts {
  const realRoot = location?.root || identityOf(root);
  const index = location
    ? readIndex(location.dir, realRoot)
    : emptyIndex(realRoot);
  const nextFiles: Record<string, CacheEntry> = {};
  const facts: FileFacts[] = [];
  const parts: Array<{ path: string; hash: string }> = [];
  let dirty = false;

  for (const filePath of collected.files) {
    const absolute = path.join(root, filePath.replace(/^\.\//, ''));
    let stat: fs.Stats;
    try {
      stat = fs.statSync(absolute);
    } catch {
      dirty = true;
      continue;
    }

    const previous = index.files[filePath];
    const statMatches =
      previous &&
      previous.size === stat.size &&
      previous.mtimeMs === stat.mtimeMs;
    if (statMatches && previous) {
      const reused = loadFacts(location?.dir || null, previous.hash, filePath);
      if (reused) {
        nextFiles[filePath] = previous;
        facts.push(reused);
        parts.push({ path: filePath, hash: previous.hash });
        continue;
      }
    }

    let source = '';
    try {
      source = fs.readFileSync(absolute, 'utf8');
    } catch {
      dirty = true;
      continue;
    }

    const hash = contentHash(filePath, source);
    const entry = { hash, size: stat.size, mtimeMs: stat.mtimeMs };
    const reused = loadFacts(location?.dir || null, hash, filePath);
    if (reused) {
      nextFiles[filePath] = entry;
      facts.push(reused);
      parts.push({ path: filePath, hash });
      if (
        !previous ||
        previous.hash !== hash ||
        previous.size !== entry.size ||
        previous.mtimeMs !== entry.mtimeMs
      ) {
        dirty = true;
      }
      continue;
    }

    const parsed = parseSource(filePath, source);
    if (!parsed) {
      dirty = true;
      continue;
    }
    const parsedFacts: FileFacts = { path: filePath, ...parsed };
    if (location) {
      storeFacts(location.dir, hash, parsedFacts);
    }
    const fresh = location
      ? loadFacts(location.dir, hash, filePath)
      : rememberFacts(hash, parsedFacts);
    if (!fresh) {
      dirty = true;
      continue;
    }
    nextFiles[filePath] = entry;
    facts.push(fresh);
    parts.push({ path: filePath, hash });
    dirty = true;
  }

  const previousPaths = Object.keys(index.files);
  if (
    previousPaths.length !== Object.keys(nextFiles).length ||
    previousPaths.some((filePath) => !nextFiles[filePath])
  ) {
    dirty = true;
  }

  index.files = nextFiles;
  return {
    facts,
    signature: signatureFor(collected.truncated, parts),
    dirty,
    index,
  };
}

function persist(location: CacheLocation, gathered: GatheredFacts): void {
  if (!gathered.dirty) {
    return;
  }
  writeJson(path.join(location.dir, 'index.json'), gathered.index);
  pruneFacts(
    location.dir,
    new Set(Object.values(gathered.index.files).map((entry) => entry.hash)),
  );
}

function resolveCached(
  root: string,
  collected: { files: string[]; truncated: boolean },
  location: CacheLocation | null,
  assemble: (facts: FileFacts[]) => Graph,
): Graph {
  const gathered = gather(root, collected, location);
  const memoryKey = location?.root || identityOf(root);
  const previous = graphs.get(memoryKey);
  if (previous && previous.signature === gathered.signature) {
    if (location) {
      persist(location, gathered);
    }
    return previous.graph;
  }

  const graph = assemble(gathered.facts);
  graphs.set(memoryKey, { signature: gathered.signature, graph });
  if (location) {
    persist(location, gathered);
  }
  return graph;
}

export function withCachedFacts(
  root: string,
  collected: { files: string[]; truncated: boolean },
  assemble: (facts: FileFacts[]) => Graph,
): Graph {
  const location = locate(root);
  if (!location) {
    return resolveCached(root, collected, null, assemble);
  }

  try {
    return withStoreLock(location.lockDir, () =>
      resolveCached(root, collected, location, assemble),
    );
  } catch (error) {
    if (error instanceof CliError) {
      return resolveCached(root, collected, null, assemble);
    }
    throw error;
  }
}
