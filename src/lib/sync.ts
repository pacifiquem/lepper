import fs from 'fs';
import os from 'os';
import path from 'path';
import { mergeDiary, sameDiary } from './diary';
import { fingerprint } from './fingerprint';
import { git, gitOk, hasRemote } from './git';
import { rebuildSearchIndex } from './notes';
import { excerpt } from './text';
import {
  DiaryIndex,
  LEPPER_REF,
  LepperIndex,
  NoteBlob,
  NoteSummary,
  TodoIndex,
} from './types';
import {
  openStore,
  pruneUnreachableLooseObjects,
  readDiary,
  readIndex,
  readNoteBlob,
  readTodos,
  Store,
  writeDiary,
  writeIndex,
  writeNoteBlob,
  writeTodos,
} from './store';
import { CliError } from './errors';

const REMOTE_REF = `${LEPPER_REF}-remote`;

function envFor(store: Store): NodeJS.ProcessEnv {
  const name = git(store.root, ['config', 'user.name']);
  const email = git(store.root, ['config', 'user.email']);
  const identity: NodeJS.ProcessEnv = {};
  if (name.status !== 0 || !name.stdout) {
    identity.GIT_AUTHOR_NAME = 'lepper';
    identity.GIT_COMMITTER_NAME = 'lepper';
  }
  if (email.status !== 0 || !email.stdout) {
    identity.GIT_AUTHOR_EMAIL = 'lepper@users.noreply.local';
    identity.GIT_COMMITTER_EMAIL = 'lepper@users.noreply.local';
  }

  return {
    ...identity,
    GIT_DIR: store.commonGitDir,
    GIT_WORK_TREE: store.dir,
    GIT_INDEX_FILE: path.join(store.dir, 'index.git'),
  };
}

function rev(store: Store, ref: string): string | null {
  const result = git(store.root, ['rev-parse', '--verify', `${ref}^{commit}`]);
  if (result.status !== 0 || !result.stdout) {
    return null;
  }
  return result.stdout;
}

function treeOf(store: Store, commit: string): string | null {
  const result = git(store.root, ['rev-parse', `${commit}^{tree}`]);
  if (result.status !== 0 || !result.stdout) {
    return null;
  }
  return result.stdout;
}

function isAncestor(
  store: Store,
  ancestor: string,
  descendant: string,
): boolean {
  if (ancestor === descendant) {
    return true;
  }
  return (
    git(store.root, ['merge-base', '--is-ancestor', ancestor, descendant])
      .status === 0
  );
}

function remoteRefMissing(stderr: string): boolean {
  return /couldn't find remote ref|unable to find remote ref|remote ref does not exist/i.test(
    stderr,
  );
}

function pushRejected(stderr: string): boolean {
  return /non-fast-forward|rejected|fetch first/i.test(stderr);
}

function fetchRemote(store: Store): string | null {
  const fetched = git(store.root, [
    'fetch',
    'origin',
    `+${LEPPER_REF}:${REMOTE_REF}`,
  ]);
  if (fetched.status !== 0) {
    if (remoteRefMissing(`${fetched.stderr}\n${fetched.stdout}`)) {
      return null;
    }
    throw new CliError(
      fetched.stderr || 'Failed to fetch lepper notes from origin.',
    );
  }
  return rev(store, REMOTE_REF);
}

function checkoutRef(store: Store, commit: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const env: NodeJS.ProcessEnv = {
    GIT_DIR: store.commonGitDir,
    GIT_WORK_TREE: dest,
    GIT_INDEX_FILE: path.join(store.dir, 'fetch.index'),
  };
  gitOk(store.root, ['read-tree', '--reset', commit], env);
  gitOk(store.root, ['checkout-index', '-a', '-f'], env);
}

function newer(a: string, b: string): boolean {
  return a >= b;
}

function mergeNotes(local: LepperIndex, incoming: LepperIndex): LepperIndex {
  const notes: Record<string, NoteSummary> = { ...local.notes };
  for (const [pathKey, remoteNote] of Object.entries(incoming.notes || {})) {
    const current = notes[pathKey];
    if (!current || newer(remoteNote.createdAt, current.createdAt)) {
      notes[pathKey] = remoteNote;
    }
  }
  return {
    version: local.version,
    updatedAt: new Date().toISOString(),
    notes,
  };
}

function mergeTodos(local: TodoIndex, incoming: TodoIndex): TodoIndex {
  const todos = { ...local.todos };
  for (const [id, remoteTodo] of Object.entries(incoming.todos || {})) {
    const current = todos[id];
    if (!current || newer(remoteTodo.updatedAt, current.updatedAt)) {
      todos[id] = remoteTodo;
    }
  }
  return {
    version: local.version,
    updatedAt: new Date().toISOString(),
    todos,
  };
}

function copyChain(from: Store, into: Store, start: string | null): void {
  const seen = new Set<string>();
  let cursor = start;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const blob = readNoteBlob(from, cursor);
    if (!blob) {
      break;
    }
    writeNoteBlob(into, blob);
    cursor = blob.parent;
  }
}

function readChain(store: Store, start: string): NoteBlob[] {
  const blobs: NoteBlob[] = [];
  const seen = new Set<string>();
  let cursor: string | null = start;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const blob = readNoteBlob(store, cursor);
    if (!blob) {
      break;
    }
    blobs.push(blob);
    cursor = blob.parent;
  }
  return blobs;
}

function sameFingerprints(
  left: Record<string, { fingerprint: string }>,
  right: Record<string, { fingerprint: string }>,
): boolean {
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) {
    return false;
  }
  for (const key of leftKeys) {
    if (!right[key] || right[key].fingerprint !== left[key].fingerprint) {
      return false;
    }
  }
  return true;
}

function sameTodos(left: TodoIndex, right: TodoIndex): boolean {
  const leftKeys = Object.keys(left.todos);
  if (leftKeys.length !== Object.keys(right.todos).length) {
    return false;
  }
  for (const key of leftKeys) {
    const current = left.todos[key];
    const incoming = right.todos[key];
    if (
      !incoming ||
      incoming.fingerprint !== current.fingerprint ||
      incoming.status !== current.status ||
      incoming.updatedAt !== current.updatedAt
    ) {
      return false;
    }
  }
  return true;
}

function summaryFromBlob(note: NoteBlob): NoteSummary {
  return {
    fingerprint: note.fingerprint,
    path: note.path,
    title: note.title,
    excerpt: excerpt(note.body),
    tags: note.tags,
    parent: note.parent,
    createdAt: note.createdAt,
    agent: note.agent,
  };
}

function versionKey(blob: NoteBlob): string {
  return fingerprint({
    path: blob.path,
    title: blob.title,
    body: blob.body,
    tags: blob.tags,
    createdAt: blob.createdAt,
    agent: blob.agent || null,
    kind: 'note' as const,
  });
}

function preferVersion(current: NoteBlob, next: NoteBlob): NoteBlob {
  const currentLinked = current.parent != null;
  const nextLinked = next.parent != null;
  if (currentLinked !== nextLinked) {
    return nextLinked ? next : current;
  }
  return next.fingerprint > current.fingerprint ? next : current;
}

function compareVersions(left: NoteBlob, right: NoteBlob): number {
  if (left.createdAt < right.createdAt) {
    return -1;
  }
  if (left.createdAt > right.createdAt) {
    return 1;
  }
  // Fingerprints change when a note is relinked, so a second sync would
  // reorder equal timestamps and publish again. The version key does not.
  const leftKey = versionKey(left);
  const rightKey = versionKey(right);
  if (leftKey < rightKey) {
    return -1;
  }
  if (leftKey > rightKey) {
    return 1;
  }
  return 0;
}

function relink(blob: NoteBlob, parent: string | null): NoteBlob {
  const payload = {
    path: blob.path,
    title: blob.title,
    body: blob.body,
    tags: blob.tags,
    parent,
    createdAt: blob.createdAt,
    agent: blob.agent || null,
    kind: 'note' as const,
  };
  return {
    fingerprint: fingerprint(payload),
    path: blob.path,
    title: blob.title,
    body: blob.body,
    tags: blob.tags,
    parent,
    createdAt: blob.createdAt,
    agent: blob.agent,
    kind: 'note',
  };
}

/**
 * Each clone may already have its own parent chain for one path. Rebuild a
 * single createdAt order so the older chain stays reachable from the tip.
 * A restack of the same body is kept once, preferring the blob that already
 * has a parent, so a later sync does not graft it again.
 */
function unifyChains(
  store: Store,
  leftStart: string,
  rightStart: string,
): NoteBlob | undefined {
  const chosen = new Map<string, NoteBlob>();
  const blobs = readChain(store, leftStart).concat(
    readChain(store, rightStart),
  );
  for (const blob of blobs) {
    const key = versionKey(blob);
    const current = chosen.get(key);
    chosen.set(key, current ? preferVersion(current, blob) : blob);
  }

  const versions = Array.from(chosen.values()).sort(compareVersions);
  if (versions.length === 0) {
    return undefined;
  }

  const members = new Set<string>();
  for (const blob of versions) {
    members.add(blob.fingerprint);
  }

  let previous: string | null = null;
  const oldestParent = versions[0].parent;
  if (oldestParent && !members.has(oldestParent)) {
    previous = oldestParent;
  }

  let tip: NoteBlob | undefined;
  for (const blob of versions) {
    const next = blob.parent === previous ? blob : relink(blob, previous);
    if (next.fingerprint !== blob.fingerprint) {
      writeNoteBlob(store, next);
    }
    previous = next.fingerprint;
    tip = next;
  }
  return tip;
}

function copyFileIfPresent(from: string, to: string): void {
  if (fs.existsSync(from)) {
    fs.copyFileSync(from, to);
  }
}

function importStore(fromDir: string, into: Store): boolean {
  const remoteStore: Store = { ...into, dir: fromDir };
  const remoteIndexPath = path.join(fromDir, 'index.json');
  if (fs.existsSync(remoteIndexPath)) {
    const incoming = JSON.parse(
      fs.readFileSync(remoteIndexPath, 'utf-8'),
    ) as LepperIndex;
    const local = readIndex(into);

    for (const summary of Object.values(incoming.notes || {})) {
      copyChain(remoteStore, into, summary.fingerprint);
    }

    const merged = mergeNotes(local, incoming);
    for (const pathKey of Object.keys(merged.notes)) {
      const localNote = local.notes[pathKey];
      const remoteNote = incoming.notes?.[pathKey];
      if (
        !localNote ||
        !remoteNote ||
        localNote.fingerprint === remoteNote.fingerprint
      ) {
        continue;
      }

      const unified = unifyChains(
        into,
        localNote.fingerprint,
        remoteNote.fingerprint,
      );
      if (unified) {
        merged.notes[pathKey] = summaryFromBlob(unified);
      }
    }

    const remoteTodosPath = path.join(fromDir, 'todos.json');
    const incomingTodos = fs.existsSync(remoteTodosPath)
      ? (JSON.parse(fs.readFileSync(remoteTodosPath, 'utf-8')) as TodoIndex)
      : undefined;
    const localTodos = readTodos(into);
    const mergedTodos = incomingTodos
      ? mergeTodos(localTodos, incomingTodos)
      : undefined;
    const remoteDiaryPath = path.join(fromDir, 'diary.json');
    const incomingDiary = fs.existsSync(remoteDiaryPath)
      ? (JSON.parse(fs.readFileSync(remoteDiaryPath, 'utf-8')) as DiaryIndex)
      : undefined;
    const localDiary = readDiary(into);
    const mergedDiary = incomingDiary
      ? mergeDiary(localDiary, incomingDiary)
      : undefined;
    const notesMatch = sameFingerprints(merged.notes, incoming.notes || {});
    const todosMatch = incomingTodos
      ? sameTodos(mergedTodos as TodoIndex, incomingTodos)
      : Object.keys(localTodos.todos).length === 0;
    const diaryMatch = incomingDiary
      ? sameDiary(mergedDiary as DiaryIndex, incomingDiary)
      : Object.keys(localDiary.entries).length === 0;

    if (notesMatch && todosMatch && diaryMatch) {
      fs.copyFileSync(remoteIndexPath, path.join(into.dir, 'index.json'));
      copyFileIfPresent(remoteTodosPath, path.join(into.dir, 'todos.json'));
      copyFileIfPresent(remoteDiaryPath, path.join(into.dir, 'diary.json'));
      copyFileIfPresent(
        path.join(fromDir, 'search.json'),
        path.join(into.dir, 'search.json'),
      );
      return false;
    }

    if (notesMatch) {
      fs.copyFileSync(remoteIndexPath, path.join(into.dir, 'index.json'));
      copyFileIfPresent(
        path.join(fromDir, 'search.json'),
        path.join(into.dir, 'search.json'),
      );
    } else if (!sameFingerprints(local.notes, merged.notes)) {
      writeIndex(into, merged);
    }

    if (mergedTodos && incomingTodos && !todosMatch) {
      writeTodos(into, mergedTodos);
    }
    if (mergedDiary && incomingDiary && !diaryMatch) {
      writeDiary(into, mergedDiary);
    }
    return true;
  }

  return false;
}

function parentsFor(
  store: Store,
  local: string | null,
  remote: string | null,
): string[] {
  if (local && remote) {
    if (local === remote || isAncestor(store, local, remote)) {
      return [remote];
    }
    if (isAncestor(store, remote, local)) {
      return [local];
    }
    return [remote, local];
  }
  if (remote) {
    return [remote];
  }
  if (local) {
    return [local];
  }
  return [];
}

function publish(
  store: Store,
  remote: string | null,
): { commit: string; created: boolean } {
  fs.mkdirSync(store.dir, { recursive: true });
  // Restacked notes leave the pre-fetch blob on disk. Publishing it makes the
  // other clone commit a deletion, and the next sync puts the blob back.
  pruneUnreachableLooseObjects(store);
  const env = envFor(store);
  gitOk(store.root, ['read-tree', '--empty'], env);
  gitOk(store.root, ['add', '-A'], env);
  const tree = gitOk(store.root, ['write-tree'], env);
  const local = rev(store, LEPPER_REF);
  const diverged = Boolean(
    local &&
      remote &&
      local !== remote &&
      !isAncestor(store, local, remote) &&
      !isAncestor(store, remote, local),
  );

  if (
    !diverged &&
    local &&
    tree === treeOf(store, local) &&
    (!remote || remote === local || isAncestor(store, remote, local))
  ) {
    return { commit: local, created: false };
  }

  if (
    remote &&
    !diverged &&
    tree === treeOf(store, remote) &&
    (!local || isAncestor(store, local, remote))
  ) {
    if (local !== remote) {
      gitOk(store.root, ['update-ref', LEPPER_REF, remote]);
    }
    return { commit: remote, created: false };
  }

  const args = ['commit-tree', tree, '-m', 'lepper notes'];
  for (const parent of parentsFor(store, local, remote)) {
    args.push('-p', parent);
  }
  const commit = gitOk(store.root, args, env);
  gitOk(store.root, ['update-ref', LEPPER_REF, commit]);
  return { commit, created: true };
}

function pullRemote(store: Store, remote: string): boolean {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lepper-sync-'));
  try {
    checkoutRef(store, remote, tmp);
    return importStore(tmp, store);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export interface SyncResult {
  commit: string;
  pulled: boolean;
  pushed: boolean;
}

export function syncNotes(cwd: string = process.cwd()): SyncResult {
  const store = openStore(cwd, true);
  const remoteExists = hasRemote(store.root);
  let pulled = false;
  let pushed = false;
  let commit = '';

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const remote = remoteExists ? fetchRemote(store) : null;
    let contentChanged = true;
    if (remote) {
      contentChanged = pullRemote(store, remote);
      pulled = true;
    }

    if (!remote || contentChanged) {
      rebuildSearchIndex(store);
    }
    const published = publish(store, remote);
    commit = published.commit;

    if (!remoteExists) {
      break;
    }
    if (!published.created && remote && commit === remote) {
      break;
    }

    const push = git(store.root, [
      'push',
      'origin',
      `${LEPPER_REF}:${LEPPER_REF}`,
    ]);
    if (push.status === 0) {
      pushed = true;
      break;
    }
    if (attempt === 3 || !pushRejected(push.stderr)) {
      throw new CliError(
        push.stderr || 'Failed to push lepper notes to origin.',
      );
    }
  }

  return { commit, pulled, pushed };
}
