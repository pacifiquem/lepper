import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { gunzipSync, gzipSync } from 'zlib';
import { noteVersionKey } from './chain';
import { CliError } from './errors';
import { GitContext, resolveGit } from './git';
import { withStoreLock } from './lock';
import {
  DiaryIndex,
  LepperIndex,
  NoteBlob,
  SearchIndex,
  STORE_VERSION,
  RuleIndex,
  TodoIndex,
} from './types';

export const LOOSE_OBJECT_PACK_THRESHOLD = 400;

export interface Store extends GitContext {
  dir: string;
}

export function storeDir(gitDir: string): string {
  return path.join(gitDir, 'lepper');
}

export function openStore(cwd: string = process.cwd(), create = true): Store {
  const git = resolveGit(cwd);
  const dir = storeDir(git.commonGitDir);

  if (!fs.existsSync(dir)) {
    if (!create) {
      throw new CliError(
        'No lepper notes yet. Record a note with "lepper record".',
      );
    }
    fs.mkdirSync(path.join(dir, 'objects'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'packs'), { recursive: true });
  }

  const ignoreFile = path.join(dir, '.gitignore');
  // index.git lives in this directory, so `git add -A` also sees the lock
  // file git creates beside it. That lock must not enter the notes tree.
  const ignore =
    'LOCK\nLOCK.stale-*\n*.tmp\n*.lock\nindex.git\nfetch.index\nMIGRATED\ngraph/\n';
  if (
    !fs.existsSync(ignoreFile) ||
    fs.readFileSync(ignoreFile, 'utf8') !== ignore
  ) {
    fs.writeFileSync(ignoreFile, ignore);
  }

  return { ...git, dir };
}

function indexPath(store: Store): string {
  return path.join(store.dir, 'index.json');
}

function searchPath(store: Store): string {
  return path.join(store.dir, 'search.json');
}

function todosPath(store: Store): string {
  return path.join(store.dir, 'todos.json');
}

function diaryPath(store: Store): string {
  return path.join(store.dir, 'diary.json');
}

function rulesPath(store: Store): string {
  return path.join(store.dir, 'rules.json');
}

function objectPath(store: Store, fingerprint: string): string {
  return path.join(
    store.dir,
    'objects',
    fingerprint.slice(0, 2),
    fingerprint.slice(2, 4),
    fingerprint,
  );
}

function emptyIndex(): LepperIndex {
  return {
    version: STORE_VERSION,
    updatedAt: new Date().toISOString(),
    notes: {},
  };
}

function emptySearch(): SearchIndex {
  return { version: STORE_VERSION, df: {}, docs: {} };
}

function emptyTodos(): TodoIndex {
  return {
    version: STORE_VERSION,
    updatedAt: new Date().toISOString(),
    todos: {},
  };
}

function emptyDiary(): DiaryIndex {
  return {
    version: STORE_VERSION,
    updatedAt: new Date().toISOString(),
    entries: {},
  };
}

function emptyRules(): RuleIndex {
  return {
    version: STORE_VERSION,
    updatedAt: new Date().toISOString(),
    rules: {},
  };
}

function readJsonFile<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) {
    return fallback;
  }

  const raw = fs.readFileSync(file, 'utf-8').trim();
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new CliError(`Failed to read ${path.basename(file)}: ${detail}`);
  }
}

function writeJsonFile(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
  fs.renameSync(tmp, file);
}

export function readIndex(store: Store): LepperIndex {
  const index = readJsonFile(indexPath(store), emptyIndex());
  if (!index.notes) {
    index.notes = {};
  }
  return index;
}

export function writeIndex(store: Store, index: LepperIndex): void {
  index.version = STORE_VERSION;
  index.updatedAt = new Date().toISOString();
  writeJsonFile(indexPath(store), index);
}

export function readSearchIndex(store: Store): SearchIndex {
  const index = readJsonFile(searchPath(store), emptySearch());
  index.df = index.df || {};
  index.docs = index.docs || {};
  return index;
}

export function writeSearchIndex(store: Store, index: SearchIndex): void {
  index.version = STORE_VERSION;
  writeJsonFile(searchPath(store), index);
}

export function readDiary(store: Store): DiaryIndex {
  const index = readJsonFile(diaryPath(store), emptyDiary());
  index.entries = index.entries || {};
  return index;
}

export function writeDiary(store: Store, index: DiaryIndex): void {
  index.version = STORE_VERSION;
  index.updatedAt = new Date().toISOString();
  writeJsonFile(diaryPath(store), index);
}

export function readTodos(store: Store): TodoIndex {
  const index = readJsonFile(todosPath(store), emptyTodos());
  index.todos = index.todos || {};
  return index;
}

export function writeTodos(store: Store, index: TodoIndex): void {
  index.version = STORE_VERSION;
  index.updatedAt = new Date().toISOString();
  writeJsonFile(todosPath(store), index);
}

export function readRules(store: Store): RuleIndex {
  const index = readJsonFile(rulesPath(store), emptyRules());
  index.rules = index.rules || {};
  return index;
}

export function writeRules(store: Store, index: RuleIndex): void {
  index.version = STORE_VERSION;
  index.updatedAt = new Date().toISOString();
  writeJsonFile(rulesPath(store), index);
}

export function writeNoteBlob(store: Store, note: NoteBlob): void {
  const file = objectPath(store, note.fingerprint);
  if (fs.existsSync(file)) {
    return;
  }
  writeJsonFile(file, note);
}

function isNoteBlob(value: unknown): value is NoteBlob {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const blob = value as NoteBlob;
  return (
    typeof blob.fingerprint === 'string' &&
    typeof blob.path === 'string' &&
    typeof blob.body === 'string'
  );
}

export function readAllNoteBlobs(store: Store): NoteBlob[] {
  const blobs: NoteBlob[] = [];
  const seen = new Set<string>();
  const add = (blob: NoteBlob | undefined) => {
    if (!isNoteBlob(blob) || seen.has(blob.fingerprint)) {
      return;
    }
    seen.add(blob.fingerprint);
    blobs.push(blob);
  };

  for (const fp of countLooseObjects(store)) {
    try {
      add(readNoteBlob(store, fp));
    } catch {
      // a torn object is ignored until a later write replaces it
    }
  }

  for (const pack of packFiles(store)) {
    try {
      const objects = JSON.parse(
        gunzipSync(fs.readFileSync(pack)).toString('utf8'),
      ) as Record<string, NoteBlob>;
      for (const blob of Object.values(objects)) {
        add(blob);
      }
    } catch {
      // skip a pack that cannot be read
    }
  }

  return blobs;
}

export function readNoteBlob(
  store: Store,
  fingerprint: string,
): NoteBlob | undefined {
  const file = objectPath(store, fingerprint);
  if (fs.existsSync(file)) {
    return readJsonFile<NoteBlob>(file, undefined as unknown as NoteBlob);
  }

  return readPackedBlob(store, fingerprint);
}

function packFiles(store: Store): string[] {
  const dir = path.join(store.dir, 'packs');
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json.gz'))
    .map((name) => path.join(dir, name))
    .sort();
}

function readPackedBlob(
  store: Store,
  fingerprint: string,
): NoteBlob | undefined {
  for (const pack of packFiles(store)) {
    const idxFile = pack.replace(/\.json\.gz$/, '.idx.json');
    const idx = readJsonFile<Record<string, number>>(idxFile, {});
    if (!(fingerprint in idx)) {
      continue;
    }

    const raw = gunzipSync(fs.readFileSync(pack)).toString('utf-8');
    const objects = JSON.parse(raw) as Record<string, NoteBlob>;
    return objects[fingerprint];
  }

  return undefined;
}

function countLooseObjects(store: Store): string[] {
  const objectsDir = path.join(store.dir, 'objects');
  if (!fs.existsSync(objectsDir)) {
    return [];
  }

  const fingerprints: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && !entry.name.endsWith('.tmp')) {
        fingerprints.push(entry.name);
      }
    }
  };
  walk(objectsDir);
  return fingerprints;
}

export function packLooseObjects(store: Store, keep: Set<string>): number {
  const loose = countLooseObjects(store);
  const toPack = loose.filter((fp) => !keep.has(fp));
  if (toPack.length === 0) {
    return 0;
  }

  const packed: Record<string, NoteBlob> = {};
  const idx: Record<string, number> = {};
  let offset = 0;

  for (const fp of toPack) {
    const blob = readNoteBlob(store, fp);
    if (!blob) {
      continue;
    }
    packed[fp] = blob;
    idx[fp] = offset;
    offset += 1;
  }

  if (Object.keys(packed).length === 0) {
    return 0;
  }

  const packDir = path.join(store.dir, 'packs');
  fs.mkdirSync(packDir, { recursive: true });
  const id = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const packFile = path.join(packDir, `pack-${id}.json.gz`);
  const idxFile = path.join(packDir, `pack-${id}.idx.json`);
  fs.writeFileSync(packFile, gzipSync(Buffer.from(JSON.stringify(packed))));
  writeJsonFile(idxFile, idx);

  for (const fp of Object.keys(packed)) {
    const file = objectPath(store, fp);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }

  return Object.keys(packed).length;
}

export function pruneUnreachableLooseObjects(store: Store): void {
  const reachable = new Set<string>();
  const represented = new Set<string>();
  const index = readIndex(store);
  for (const summary of Object.values(index.notes)) {
    const seen = new Set<string>();
    let cursor: string | null = summary.fingerprint;
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      reachable.add(cursor);
      const blob = readNoteBlob(store, cursor);
      if (blob) {
        represented.add(noteVersionKey(blob));
      }
      cursor = blob ? blob.parent : null;
    }
  }

  for (const fp of countLooseObjects(store)) {
    if (reachable.has(fp)) {
      continue;
    }
    const file = objectPath(store, fp);
    if (!fs.existsSync(file)) {
      continue;
    }

    let blob: NoteBlob | undefined;
    try {
      blob = readJsonFile<NoteBlob>(file, undefined as unknown as NoteBlob);
    } catch {
      blob = undefined;
    }
    // A body that is not already on a chain was dropped from the index by a
    // concurrent write. Keep the file so it can be linked back.
    if (isNoteBlob(blob) && !represented.has(noteVersionKey(blob))) {
      continue;
    }
    fs.unlinkSync(file);
  }
}

export function maybePack(store: Store): void {
  const loose = countLooseObjects(store);
  if (loose.length <= LOOSE_OBJECT_PACK_THRESHOLD) {
    return;
  }

  const index = readIndex(store);
  const keep = new Set(
    Object.values(index.notes).map((note) => note.fingerprint),
  );
  packLooseObjects(store, keep);
}

export function withStore<T>(
  cwd: string,
  fn: (store: Store) => T,
  create = true,
): T {
  const store = openStore(cwd, create);
  return withStoreLock(store.dir, () => fn(store));
}

export function storeExists(cwd: string = process.cwd()): boolean {
  try {
    const git = resolveGit(cwd);
    return fs.existsSync(storeDir(git.commonGitDir));
  } catch {
    return false;
  }
}
