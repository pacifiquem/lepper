import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { withLepper } from '../src/lib/api';
import { resolveGit } from '../src/lib/git';
import { recordNote } from '../src/lib/notes';
import { findNotes } from '../src/lib/search';
import { SEARCH_ANALYZER, SearchIndex } from '../src/lib/types';
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

    const index = JSON.parse(
      fs.readFileSync(searchFile(cwd), 'utf-8'),
    ) as SearchIndex;
    expect(index.analyzer).toBe(SEARCH_ANALYZER);
    expect(index.df.redis).toBeUndefined();
    expect(index.df.memory).toBe(1);
  });

  it('ranks a note with every query term above a note that repeats one term', () => {
    const cwd = createGitRepo();
    dirs.push(cwd);

    withLepper(cwd, (store) => {
      for (let i = 0; i < 6; i += 1) {
        recordNote(store, {
          path: `src/status-${i}`,
          note: 'Status flag is stored for this module.',
        });
      }
      recordNote(store, {
        path: 'src/spam',
        note: Array.from({ length: 40 }, () => 'cache').join(' '),
      });
      recordNote(store, {
        path: 'src/policy',
        note: 'Cache expiry is five minutes.',
      });
    });

    const ranked = withLepper(cwd, (store) =>
      findNotes(store, { query: 'cache expiry', limit: 5 }),
    );
    expect(ranked[0]?.path).toBe('./src/policy');

    const repetition = withLepper(cwd, (store) =>
      findNotes(store, { query: 'cache', limit: 5 }),
    );
    const spam = repetition.find((hit) => hit.path === './src/spam');
    const policy = repetition.find((hit) => hit.path === './src/policy');
    expect(spam).toBeDefined();
    expect(policy).toBeDefined();
    expect(spam && policy && spam.score < policy.score * 3).toBe(true);
  });

  it('limits results to a path prefix', () => {
    const cwd = createGitRepo();
    dirs.push(cwd);
    mkdirp(cwd, 'src/cache');
    mkdirp(cwd, 'src/auth');

    withLepper(cwd, (store) => {
      recordNote(store, {
        path: 'src/cache',
        note: 'Memory cache of API responses.',
      });
      recordNote(store, {
        path: 'src/auth',
        note: 'Login keeps a memory cache of sessions.',
      });
    });

    const hits = withLepper(cwd, (store) =>
      findNotes(store, { query: 'memory cache', path: 'src/auth' }),
    );
    expect(hits.map((hit) => hit.path)).toEqual(['./src/auth']);
  });

  it('rebuilds a legacy word-count index before scoring', () => {
    const cwd = createGitRepo();
    dirs.push(cwd);
    mkdirp(cwd, 'src/cache');

    const note = withLepper(cwd, (store) =>
      recordNote(store, {
        path: 'src/cache',
        note: 'Cache API results are in memory and expire after 5 minutes.',
      }),
    );

    fs.writeFileSync(
      searchFile(cwd),
      JSON.stringify({
        version: 1,
        df: { unrelated: 1 },
        docs: {
          [note.fingerprint]: {
            path: note.path,
            tf: { unrelated: 1 },
          },
        },
      }),
    );

    const hits = withLepper(cwd, (store) =>
      findNotes(store, { query: 'where is caching' }),
    );
    expect(hits[0]?.path).toBe('./src/cache');

    const rebuilt = JSON.parse(
      fs.readFileSync(searchFile(cwd), 'utf-8'),
    ) as SearchIndex;
    expect(rebuilt.analyzer).toBe(SEARCH_ANALYZER);
    expect(rebuilt.docs[note.fingerprint]?.length).toBeGreaterThan(0);
    expect(rebuilt.df.unrelated).toBeUndefined();
  });

  it('does not match a query that only shares a prefix', () => {
    const cwd = createGitRepo();
    dirs.push(cwd);

    withLepper(cwd, (store) => {
      recordNote(store, {
        path: 'src/words',
        note: 'Testimony from the operator is archived here.',
      });
    });

    const hits = withLepper(cwd, (store) =>
      findNotes(store, { query: 'test' }),
    );
    expect(hits).toEqual([]);
  });
});

function searchFile(cwd: string): string {
  return path.join(resolveGit(cwd).commonGitDir, 'lepper', 'search.json');
}
