import { afterEach, describe, expect, it } from 'vitest';
import { withLepper } from '../src/notes/session';
import { projectMap } from '../src/notes/map';
import { recordNote } from '../src/notes/notes';
import {
  addTodo,
  completeTodo,
  listTodos,
  startTodo,
} from '../src/todos/todos';
import { createGitRepo, mkdirp, removeTempDir } from './helpers';

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) {
    const dir = dirs.pop();
    if (dir) {
      removeTempDir(dir);
    }
  }
});

describe('projectMap', () => {
  it('marks recorded directories and leaves gaps unrecorded', () => {
    const cwd = createGitRepo();
    dirs.push(cwd);
    mkdirp(cwd, 'src/cache');
    mkdirp(cwd, 'src/auth');

    withLepper(cwd, (store) =>
      recordNote(store, {
        path: 'src/cache',
        note: 'in-memory API cache',
        title: 'Cache',
      }),
    );

    const tree = withLepper(cwd, (store) => projectMap(store));
    const src = tree.children.find((child) => child.path === './src');
    const cache = src?.children.find((child) => child.path === './src/cache');
    const auth = src?.children.find((child) => child.path === './src/auth');

    expect(cache?.recorded).toBe(true);
    expect(cache?.title).toBe('Cache');
    expect(auth?.recorded).toBe(false);
  });
});

describe('todos', () => {
  it('adds, claims, and completes shared todos with fingerprints', () => {
    const cwd = createGitRepo();
    dirs.push(cwd);

    const created = withLepper(cwd, (store) =>
      addTodo(store, { title: 'Document cache TTL', agent: 'agent-a' }),
    );
    expect(created.status).toBe('open');
    expect(created.fingerprint).toMatch(/^[a-f0-9]{64}$/);

    const started = withLepper(cwd, (store) =>
      startTodo(store, created.id, 'agent-b'),
    );
    expect(started.status).toBe('doing');
    expect(started.parent).toBe(created.fingerprint);
    expect(started.agent).toBe('agent-b');

    const done = withLepper(cwd, (store) => completeTodo(store, created.id));
    expect(done.status).toBe('done');
    expect(
      withLepper(cwd, (store) => listTodos(store, 'done')).map(
        (todo) => todo.id,
      ),
    ).toEqual([created.id]);
  });
});
