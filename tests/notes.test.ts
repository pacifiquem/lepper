import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { withLepper } from '../src/notes/session';
import { resolveGit } from '../src/utils/git';
import { historyFor, listNotes, recordNote } from '../src/notes/notes';
import {
  createGitRepo,
  mkdirp,
  removeTempDir,
  writeLegacyInfo,
} from './helpers';

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) {
    const dir = dirs.pop();
    if (dir) {
      removeTempDir(dir);
    }
  }
});

function repo(): string {
  const cwd = createGitRepo();
  dirs.push(cwd);
  mkdirp(cwd, 'src/cache');
  return cwd;
}

describe('recordNote', () => {
  it('stores notes in .git/lepper with fingerprints and path normalization', () => {
    const cwd = repo();

    const note = withLepper(cwd, (store) =>
      recordNote(store, {
        path: 'src/cache/',
        note: 'Cache API results are in memory, they expire after 5 minutes. Entry point is store.ts',
        tags: ['cache'],
        agent: 'agent-a',
      }),
    );

    expect(note.path).toBe('./src/cache');
    expect(note.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(note.parent).toBeNull();

    const { commonGitDir } = resolveGit(cwd);
    expect(fs.existsSync(path.join(commonGitDir, 'lepper', 'index.json'))).toBe(
      true,
    );
    expect(
      withLepper(cwd, (store) => listNotes(store).map((item) => item.path)),
    ).toEqual(['./src/cache']);
  });

  it('versions a path through a parent fingerprint chain', () => {
    const cwd = repo();

    const first = withLepper(cwd, (store) =>
      recordNote(store, { path: 'src/cache', note: 'first version' }),
    );
    const second = withLepper(cwd, (store) =>
      recordNote(store, { path: './src/cache', note: 'second version' }),
    );

    expect(second.parent).toBe(first.fingerprint);
    expect(second.fingerprint).not.toBe(first.fingerprint);

    const history = withLepper(cwd, (store) => historyFor(store, 'src/cache'));
    expect(history.map((item) => item.body)).toEqual([
      'second version',
      'first version',
    ]);
  });

  it('imports legacy .lepper/_info.json descriptions once', () => {
    const cwd = repo();
    writeLegacyInfo(cwd, {
      './src': 'Source code',
      src: 'Source code duplicate key after normalize',
    });

    const notes = withLepper(cwd, (store) => listNotes(store));
    expect(notes.some((note) => note.path === './src')).toBe(true);
    expect(notes.filter((note) => note.path === './src')).toHaveLength(1);
  });
});
