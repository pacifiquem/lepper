import { afterEach, describe, expect, it } from 'vitest';
import { withLepper } from '../src/lib/api';
import { recordNote } from '../src/lib/notes';
import { findNotes } from '../src/lib/search';
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

describe('findNotes', () => {
  it('answers natural language queries like where is caching', () => {
    const cwd = createGitRepo();
    dirs.push(cwd);
    mkdirp(cwd, 'src/cache');
    mkdirp(cwd, 'src/auth');

    withLepper(cwd, (store) => {
      recordNote(store, {
        path: 'src/cache',
        note: 'Cache API results are in memory, they expire after 5 minutes and the entry point is store.ts',
      });
      recordNote(store, {
        path: 'src/auth',
        note: 'Login tokens are signed in token.ts',
      });
    });

    const hits = withLepper(cwd, (store) =>
      findNotes(store, { query: 'where is caching' }),
    );

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.path).toBe('./src/cache');
    expect(hits[0]?.body).toMatch(/store\.ts/);
  });

  it('returns the latest version of a rewritten note', () => {
    const cwd = createGitRepo();
    dirs.push(cwd);
    mkdirp(cwd, 'src/cache');

    withLepper(cwd, (store) => {
      recordNote(store, { path: 'src/cache', note: 'old redis cache' });
      recordNote(store, {
        path: 'src/cache',
        note: 'in-memory cache with a five minute ttl',
      });
    });

    const hits = withLepper(cwd, (store) =>
      findNotes(store, { query: 'in-memory ttl' }),
    );
    expect(hits[0]?.body).toMatch(/in-memory cache/);
    expect(hits.every((hit) => !hit.body.includes('redis'))).toBe(true);
  });
});
