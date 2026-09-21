import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { withLepper } from '../src/lib/api';
import { historyFor, recordNote } from '../src/lib/notes';
import { LEPPER_REF } from '../src/lib/types';
import { packLooseObjects, readIndex } from '../src/lib/store';
import { syncNotes } from '../src/lib/sync';
import { createGitRepo, git, mkdirp, removeTempDir } from './helpers';

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) {
    const dir = dirs.pop();
    if (dir) {
      removeTempDir(dir);
    }
  }
});

describe('packLooseObjects', () => {
  it('packs historical blobs and still reads the version chain', () => {
    const cwd = createGitRepo();
    dirs.push(cwd);
    mkdirp(cwd, 'src/cache');

    withLepper(cwd, (store) => {
      recordNote(store, { path: 'src/cache', note: 'v1' });
      recordNote(store, { path: 'src/cache', note: 'v2' });
      recordNote(store, { path: 'src/cache', note: 'v3' });
      const keep = new Set(
        Object.values(readIndex(store).notes).map((note) => note.fingerprint),
      );
      const packed = packLooseObjects(store, keep);
      expect(packed).toBeGreaterThan(0);
    });

    const history = withLepper(cwd, (store) => historyFor(store, 'src/cache'));
    expect(history.map((item) => item.body)).toEqual(['v3', 'v2', 'v1']);
  });
});

describe('syncNotes', () => {
  it('writes a git ref so clones can share notes', () => {
    const cwd = createGitRepo();
    dirs.push(cwd);
    mkdirp(cwd, 'src/cache');

    withLepper(cwd, (store) =>
      recordNote(store, { path: 'src/cache', note: 'shared cache note' }),
    );

    const result = withLepper(cwd, (store) => syncNotes(store.root));
    expect(result.commit).toMatch(/^[a-f0-9]{40,64}$/);
    expect(result.pushed).toBe(false);

    const ref = git(cwd, ['rev-parse', LEPPER_REF]);
    expect(ref).toBe(result.commit);
    expect(fs.existsSync(path.join(cwd, '.git', 'lepper', 'index.json'))).toBe(
      true,
    );
  });
});
