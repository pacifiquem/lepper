import fs from 'fs';
import os from 'os';
import path from 'path';
import { git, gitOk, hasRemote } from './git';
import { LEPPER_REF, LepperIndex, NoteSummary, TodoIndex } from './types';
import {
  openStore,
  readIndex,
  readNoteBlob,
  readTodos,
  Store,
  writeIndex,
  writeNoteBlob,
  writeTodos,
} from './store';
import { CliError } from './errors';

function envFor(store: Store): NodeJS.ProcessEnv {
  return {
    GIT_DIR: store.commonGitDir,
    GIT_WORK_TREE: store.dir,
    GIT_INDEX_FILE: path.join(store.dir, 'index.git'),
  };
}

function snapshot(store: Store): string {
  fs.mkdirSync(store.dir, { recursive: true });
  const env = envFor(store);
  git(store.root, ['add', '-A'], env);
  const tree = gitOk(store.root, ['write-tree'], env);
  const parent = git(store.root, ['rev-parse', LEPPER_REF]);
  const args = ['commit-tree', tree, '-m', 'lepper notes'];
  if (parent.status === 0 && parent.stdout) {
    args.push('-p', parent.stdout);
  }
  const commit = gitOk(store.root, args, env);
  gitOk(store.root, ['update-ref', LEPPER_REF, commit]);
  return commit;
}

function checkoutRef(store: Store, ref: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const env: NodeJS.ProcessEnv = {
    GIT_DIR: store.commonGitDir,
    GIT_WORK_TREE: dest,
    GIT_INDEX_FILE: path.join(store.dir, 'fetch.index'),
  };
  gitOk(store.root, ['read-tree', ref], env);
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

function importStore(fromDir: string, into: Store): void {
  const remoteIndexPath = path.join(fromDir, 'index.json');
  if (fs.existsSync(remoteIndexPath)) {
    const incomingIndex = JSON.parse(
      fs.readFileSync(remoteIndexPath, 'utf-8'),
    ) as LepperIndex;
    writeIndex(into, mergeNotes(readIndex(into), incomingIndex));

    for (const summary of Object.values(incomingIndex.notes || {})) {
      const blob = readNoteBlob({ ...into, dir: fromDir }, summary.fingerprint);
      if (blob) {
        writeNoteBlob(into, blob);
      }
      let parent = summary.parent;
      while (parent) {
        const parentBlob = readNoteBlob({ ...into, dir: fromDir }, parent);
        if (!parentBlob) {
          break;
        }
        writeNoteBlob(into, parentBlob);
        parent = parentBlob.parent;
      }
    }
  }

  const remoteTodos = path.join(fromDir, 'todos.json');
  if (fs.existsSync(remoteTodos)) {
    const incomingTodos = JSON.parse(
      fs.readFileSync(remoteTodos, 'utf-8'),
    ) as TodoIndex;
    writeTodos(into, mergeTodos(readTodos(into), incomingTodos));
  }
}

export interface SyncResult {
  commit: string;
  pulled: boolean;
  pushed: boolean;
}

export function syncNotes(cwd: string = process.cwd()): SyncResult {
  const store = openStore(cwd, true);
  let pulled = false;
  let pushed = false;

  if (hasRemote(store.root)) {
    const fetch = git(store.root, [
      'fetch',
      'origin',
      `${LEPPER_REF}:${LEPPER_REF}-origin`,
    ]);
    if (fetch.status === 0) {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lepper-sync-'));
      try {
        checkoutRef(store, `${LEPPER_REF}-origin`, tmp);
        importStore(tmp, store);
        pulled = true;
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }
  }

  const commit = snapshot(store);

  if (hasRemote(store.root)) {
    const push = git(store.root, [
      'push',
      'origin',
      `${LEPPER_REF}:${LEPPER_REF}`,
    ]);
    if (push.status !== 0) {
      throw new CliError(
        push.stderr || 'Failed to push lepper notes to origin.',
      );
    }
    pushed = true;
  }

  return { commit, pulled, pushed };
}
