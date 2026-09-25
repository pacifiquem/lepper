import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { withLepper } from '../src/notes/session';
import { git as gitResult } from '../src/utils/git';
import { historyFor, recordNote } from '../src/notes/notes';
import { readIndex } from '../src/utils/store';
import { syncNotes } from '../src/notes/sync';
import { LEPPER_REF } from '../src/utils/types';
import {
  createGitRepo,
  createTempDir,
  git,
  mkdirp,
  removeTempDir,
} from './helpers';

const dirs: string[] = [];

function assertMergedHistory(
  history: Array<{ body: string; createdAt: string }>,
): void {
  expect(history.map((item) => item.body).sort()).toEqual([
    'alice-1',
    'alice-2',
    'bob-1',
    'bob-2',
  ]);
  for (let index = 0; index < history.length - 1; index += 1) {
    expect(history[index].createdAt >= history[index + 1].createdAt).toBe(true);
  }
}

afterEach(() => {
  while (dirs.length) {
    const dir = dirs.pop();
    if (dir) {
      removeTempDir(dir);
    }
  }
});

function pair(): { bare: string; alice: string } {
  const bare = createTempDir();
  dirs.push(bare);
  git(bare, ['init', '--bare']);

  const alice = createGitRepo();
  dirs.push(alice);
  git(alice, ['remote', 'add', 'origin', bare]);
  git(alice, ['push', '-u', 'origin', 'HEAD']);
  return { bare, alice };
}

function cloneFrom(bare: string, name: string): string {
  const parent = createTempDir();
  dirs.push(parent);
  git(parent, ['clone', bare, name]);
  const cwd = path.join(parent, name);
  git(cwd, ['config', 'user.email', `${name}@example.com`]);
  git(cwd, ['config', 'user.name', name]);
  return cwd;
}

describe('sync across clones', () => {
  it('lets a clone push its notes on top of notes it fetched', () => {
    const { bare, alice } = pair();
    mkdirp(alice, 'src/cache');
    mkdirp(alice, 'src/api');

    withLepper(alice, (store) => {
      recordNote(store, {
        path: 'src/cache',
        note: 'alice cache note',
        agent: 'alice',
      });
      recordNote(store, {
        path: 'src/api',
        note: 'alice api note',
        agent: 'alice',
      });
    });

    const published = withLepper(alice, (store) => syncNotes(store.root));
    expect(published.pushed).toBe(true);
    expect(git(bare, ['rev-parse', LEPPER_REF])).toBe(published.commit);

    const bob = cloneFrom(bare, 'bob');
    expect(
      gitResult(bob, ['rev-parse', '--verify', `${LEPPER_REF}^{commit}`])
        .status,
    ).not.toBe(0);

    withLepper(bob, (store) => {
      recordNote(store, {
        path: 'src/db',
        note: 'bob db note',
        agent: 'bob',
      });
      recordNote(store, {
        path: 'src/cache',
        note: 'bob cache note',
        agent: 'bob',
      });
    });

    const bobSync = withLepper(bob, (store) => syncNotes(store.root));
    expect(bobSync.pulled).toBe(true);
    expect(bobSync.pushed).toBe(true);
    git(bob, ['merge-base', '--is-ancestor', published.commit, bobSync.commit]);
    expect(git(bare, ['rev-parse', LEPPER_REF])).toBe(bobSync.commit);

    const bobNotes = withLepper(bob, (store) => readIndex(store).notes);
    expect(Object.keys(bobNotes).sort()).toEqual([
      './src/api',
      './src/cache',
      './src/db',
    ]);
    expect(
      withLepper(bob, (store) => historyFor(store, 'src/cache')).map(
        (item) => item.body,
      ),
    ).toEqual(['bob cache note', 'alice cache note']);

    const aliceSync = withLepper(alice, (store) => syncNotes(store.root));
    expect(aliceSync.pulled).toBe(true);
    expect(aliceSync.pushed).toBe(false);
    expect(aliceSync.commit).toBe(bobSync.commit);
    const aliceNotes = withLepper(alice, (store) => readIndex(store).notes);
    expect(Object.keys(aliceNotes).sort()).toEqual([
      './src/api',
      './src/cache',
      './src/db',
    ]);
    expect(aliceNotes['./src/db']?.excerpt).toMatch(/bob db note/);

    const again = withLepper(bob, (store) => syncNotes(store.root));
    expect(again.pulled).toBe(true);
    expect(again.pushed).toBe(false);
    expect(again.commit).toBe(aliceSync.commit);

    const files = git(bare, ['ls-tree', '-r', '--name-only', LEPPER_REF])
      .split('\n')
      .filter(Boolean);
    expect(files).not.toContain('index.git.lock');
    expect(files).not.toContain('index.git');
    expect(files).not.toContain('fetch.index');
    expect(files).not.toContain('MIGRATED');
  }, 30000);

  it('pushes a merge commit when the local notes ref diverged', () => {
    const { alice } = pair();
    mkdirp(alice, 'src');
    withLepper(alice, (store) =>
      recordNote(store, {
        path: 'src/api',
        note: 'api base',
        agent: 'alice',
      }),
    );
    const first = withLepper(alice, (store) => syncNotes(store.root));
    expect(first.pushed).toBe(true);

    const bob = cloneFrom(git(alice, ['remote', 'get-url', 'origin']), 'bob');
    const pulled = withLepper(bob, (store) => syncNotes(store.root));
    expect(pulled.pulled).toBe(true);

    const tree = git(bob, ['rev-parse', `${pulled.commit}^{tree}`]);
    const orphan = git(bob, ['commit-tree', tree, '-m', 'divergent notes']);
    git(bob, ['update-ref', LEPPER_REF, orphan]);
    withLepper(bob, (store) =>
      recordNote(store, { path: 'src/db', note: 'db pool', agent: 'bob' }),
    );

    const merged = withLepper(bob, (store) => syncNotes(store.root));
    expect(merged.pushed).toBe(true);
    git(bob, ['merge-base', '--is-ancestor', pulled.commit, merged.commit]);
    git(bob, ['merge-base', '--is-ancestor', orphan, merged.commit]);

    const notes = withLepper(alice, (store) => {
      syncNotes(store.root);
      return readIndex(store).notes;
    });
    expect(notes['./src/api']?.excerpt).toMatch(/api base/);
    expect(notes['./src/db']?.excerpt).toMatch(/db pool/);
  }, 30000);

  it('keeps both chains when clones extend the same path before syncing', () => {
    const { bare, alice } = pair();
    mkdirp(alice, 'src');
    withLepper(alice, (store) => {
      recordNote(store, {
        path: 'src/shared',
        note: 'alice-1',
        agent: 'alice',
      });
      recordNote(store, {
        path: 'src/shared',
        note: 'alice-2',
        agent: 'alice',
      });
    });
    const published = withLepper(alice, (store) => syncNotes(store.root));
    expect(published.pushed).toBe(true);

    const bob = cloneFrom(bare, 'bob');
    withLepper(bob, (store) => {
      recordNote(store, {
        path: 'src/shared',
        note: 'bob-1',
        agent: 'bob',
      });
      recordNote(store, {
        path: 'src/shared',
        note: 'bob-2',
        agent: 'bob',
      });
    });

    const bobSync = withLepper(bob, (store) => syncNotes(store.root));
    expect(bobSync.pushed).toBe(true);
    assertMergedHistory(
      withLepper(bob, (store) => historyFor(store, 'src/shared')),
    );

    const aliceSync = withLepper(alice, (store) => syncNotes(store.root));
    expect(aliceSync.pulled).toBe(true);
    expect(aliceSync.pushed).toBe(false);
    expect(aliceSync.commit).toBe(bobSync.commit);
    assertMergedHistory(
      withLepper(alice, (store) => historyFor(store, 'src/shared')),
    );

    const again = withLepper(bob, (store) => syncNotes(store.root));
    expect(again.pushed).toBe(false);
    expect(again.commit).toBe(bobSync.commit);
  }, 30000);
});
