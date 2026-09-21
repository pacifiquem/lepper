import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { withLepper } from '../src/lib/api';
import { resolveGit } from '../src/lib/git';
import { findNotes } from '../src/lib/search';
import { listNotes, recordNote } from '../src/lib/notes';
import {
  addWorktree,
  createGitRepo,
  git,
  mkdirp,
  removeTempDir,
} from './helpers';

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) {
    const dir = dirs.pop();
    if (dir) {
      try {
        git(dir, ['worktree', 'prune']);
      } catch {
        // ignore
      }
      removeTempDir(dir);
    }
  }
});

describe('git worktrees', () => {
  it('shares the note store across linked worktrees', () => {
    const main = createGitRepo();
    dirs.push(main);
    mkdirp(main, 'src/cache');

    const worktree = addWorktree(main);
    dirs.push(worktree);
    mkdirp(worktree, 'src/cache');

    const fromWorktree = withLepper(worktree, (store) =>
      recordNote(store, {
        path: 'src/cache',
        note: 'Cache API results are in memory. Entry point is store.ts',
        agent: 'worktree-agent',
      }),
    );

    expect(fromWorktree.path).toBe('./src/cache');

    const mainGit = resolveGit(main);
    const wtGit = resolveGit(worktree);

    expect(fs.realpathSync(wtGit.gitDir)).not.toBe(
      fs.realpathSync(mainGit.gitDir),
    );
    expect(fs.realpathSync(wtGit.commonGitDir)).toBe(
      fs.realpathSync(mainGit.commonGitDir),
    );
    expect(fs.realpathSync(wtGit.root)).toBe(fs.realpathSync(worktree));
    expect(fs.realpathSync(mainGit.root)).toBe(fs.realpathSync(main));

    const storePath = path.join(mainGit.commonGitDir, 'lepper', 'index.json');
    expect(fs.existsSync(storePath)).toBe(true);
    expect(fs.existsSync(path.join(wtGit.gitDir, 'lepper'))).toBe(false);

    const fromMain = withLepper(main, (store) => listNotes(store));
    expect(fromMain.map((note) => note.path)).toEqual(['./src/cache']);

    const hits = withLepper(main, (store) =>
      findNotes(store, { query: 'where is caching' }),
    );
    expect(hits[0]?.body).toMatch(/store\.ts/);
  });

  it('records from the primary checkout and finds from a worktree', () => {
    const main = createGitRepo();
    dirs.push(main);
    mkdirp(main, 'src/auth');

    withLepper(main, (store) =>
      recordNote(store, {
        path: 'src/auth',
        note: 'Login tokens are signed in token.ts',
      }),
    );

    const worktree = addWorktree(main);
    dirs.push(worktree);

    const hits = withLepper(worktree, (store) =>
      findNotes(store, { query: 'where are login tokens' }),
    );
    expect(hits[0]?.path).toBe('./src/auth');
  });
});
