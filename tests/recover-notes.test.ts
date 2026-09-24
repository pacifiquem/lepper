import { createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { withLepper } from '../src/lib/api';
import { withStoreLock } from '../src/lib/lock';
import {
  historyFor,
  listNotes,
  recordNote,
  recoverStoredNotes,
} from '../src/lib/notes';
import {
  openStore,
  pruneUnreachableLooseObjects,
  readIndex,
  readNoteBlob,
  writeIndex,
  writeNoteBlob,
} from '../src/lib/store';
import { NoteBlob } from '../src/lib/types';
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

function repo(): string {
  const cwd = createGitRepo();
  dirs.push(cwd);
  mkdirp(cwd, 'src');
  return cwd;
}

describe('recoverStoredNotes', () => {
  it('keeps a blob that a replaced index no longer points at', () => {
    const cwd = repo();

    withLepper(cwd, (store) => {
      recordNote(store, {
        path: 'src/auth',
        note: 'alice auth note',
        agent: 'alice',
      });
      const bob = recordNote(store, {
        path: 'src/db',
        note: 'bob db note',
        agent: 'bob',
      });
      const index = readIndex(store);
      delete index.notes[bob.path];
      writeIndex(store, index);

      pruneUnreachableLooseObjects(store);
      expect(readNoteBlob(store, bob.fingerprint)?.body).toBe('bob db note');

      recoverStoredNotes(store);
      expect(listNotes(store).map((note) => note.path)).toEqual([
        './src/auth',
        './src/db',
      ]);
    });
  });

  it('puts a same-path note back on the history chain', () => {
    const cwd = repo();

    withLepper(cwd, (store) => {
      const first = recordNote(store, {
        path: 'src/cache',
        note: 'alice cache note',
        agent: 'alice',
      });
      recordNote(store, {
        path: 'src/cache',
        note: 'bob cache note',
        agent: 'bob',
      });

      const orphan: NoteBlob = {
        fingerprint: '',
        path: './src/cache',
        title: 'cache',
        body: 'dropped cache note',
        tags: [],
        parent: first.fingerprint,
        createdAt: '2026-09-24T00:00:00.000Z',
        agent: 'cara',
        kind: 'note',
      };
      orphan.fingerprint = createHash('sha256')
        .update(JSON.stringify(orphan))
        .digest('hex');
      writeNoteBlob(store, orphan);

      pruneUnreachableLooseObjects(store);
      expect(readNoteBlob(store, orphan.fingerprint)?.body).toBe(
        'dropped cache note',
      );

      recoverStoredNotes(store);
      const bodies = historyFor(store, 'src/cache').map((note) => note.body);
      expect(bodies).toContain('alice cache note');
      expect(bodies).toContain('bob cache note');
      expect(bodies).toContain('dropped cache note');
    });
  });
});

describe('withStoreLock', () => {
  it('replaces a lock whose owner process is gone', () => {
    const cwd = repo();
    const store = openStore(cwd, true);
    fs.writeFileSync(path.join(store.dir, 'LOCK'), '999999');

    expect(withStoreLock(store.dir, () => true)).toBe(true);
    expect(fs.existsSync(path.join(store.dir, 'LOCK'))).toBe(false);
  });
});

describe('concurrent record', () => {
  it('keeps notes from two processes in the same repo', async () => {
    const cwd = repo();
    const root = path.resolve(__dirname, '..');
    const runner = path.join(root, 'node_modules/vite-node/vite-node.mjs');
    const agents = [
      ['alice', 'src/auth', 'alice concurrent auth note'],
      ['bob', 'src/db', 'bob concurrent db note'],
      ['cara', 'src/cache', 'cara concurrent cache note'],
      ['noor', 'src/queue', 'noor concurrent queue note'],
    ] as const;

    await Promise.all(
      agents.map(
        ([agent, notePath, note]) =>
          new Promise<void>((resolve, reject) => {
            const script = path.join(
              os.tmpdir(),
              `lepper-record-${agent}-${process.pid}.ts`,
            );
            fs.writeFileSync(
              script,
              [
                `import { withLepper } from ${JSON.stringify(
                  path.join(root, 'src/lib/api.ts'),
                )};`,
                `import { recordNote } from ${JSON.stringify(
                  path.join(root, 'src/lib/notes.ts'),
                )};`,
                `withLepper(${JSON.stringify(cwd)}, (store) => {`,
                '  recordNote(store, {',
                `    path: ${JSON.stringify(notePath)},`,
                `    note: ${JSON.stringify(note)},`,
                `    agent: ${JSON.stringify(agent)},`,
                '  });',
                '});',
                '',
              ].join('\n'),
            );
            const child = spawn(process.execPath, [runner, script], {
              cwd: root,
            });
            let err = '';
            child.stderr.on('data', (chunk) => {
              err += chunk;
            });
            child.on('close', (code) => {
              fs.rmSync(script, { force: true });
              if (code === 0) {
                resolve();
              } else {
                reject(new Error(err || `record ${agent} exited ${code}`));
              }
            });
          }),
      ),
    );

    const notes = withLepper(cwd, (store) =>
      listNotes(store).map((note) => note.excerpt),
    );
    expect(notes).toEqual(
      expect.arrayContaining([
        expect.stringContaining('alice concurrent auth note'),
        expect.stringContaining('bob concurrent db note'),
        expect.stringContaining('cara concurrent cache note'),
        expect.stringContaining('noor concurrent queue note'),
      ]),
    );
  }, 20000);
});
